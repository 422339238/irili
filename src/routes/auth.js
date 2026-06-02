const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const MAX_ATTEMPTS = 6;
const LOCKOUT_MINUTES = 30;

function getClientIp(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

function getAttemptRecord(ip) {
  return db.prepare('SELECT * FROM login_attempts WHERE ip = ?').get(ip);
}

function recordFailedAttempt(ip) {
  const existing = getAttemptRecord(ip);
  if (existing) {
    db.prepare('UPDATE login_attempts SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE ip = ?')
      .run(ip);
  } else {
    db.prepare('INSERT INTO login_attempts (ip, attempt_count, last_attempt_at) VALUES (?, 1, CURRENT_TIMESTAMP)')
      .run(ip);
  }
}

function resetAttempts(ip) {
  db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
}

function isLocked(record) {
  if (!record || record.attempt_count < MAX_ATTEMPTS) return false;
  const lastAttempt = new Date(record.last_attempt_at + 'Z').getTime();
  const now = Date.now();
  return (now - lastAttempt) < LOCKOUT_MINUTES * 60 * 1000;
}

function needsCaptcha(record) {
  if (!record) return false;
  return record.attempt_count >= MAX_ATTEMPTS;
}

function generateCaptcha() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  return { question: a + ' + ' + b + ' = ?', answer: String(a + b) };
}

// GET /login - show login form
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');

  const ip = getClientIp(req);
  const record = getAttemptRecord(ip);
  const showCaptcha = needsCaptcha(record);

  if (showCaptcha) {
    const captcha = generateCaptcha();
    req.session.captchaAnswer = captcha.answer;
    return res.render('login', { title: 'Login', error: null, showCaptcha: true, captchaQuestion: captcha.question });
  }

  res.render('login', { title: 'Login', error: null, showCaptcha: false, captchaQuestion: '' });
});

// POST /login - authenticate user
router.post('/login', (req, res) => {
  const { username, password, captcha } = req.body;
  const ip = getClientIp(req);
  const record = getAttemptRecord(ip);

  // Check lockout
  if (isLocked(record)) {
    const captchaData = generateCaptcha();
    req.session.captchaAnswer = captchaData.answer;
    return res.render('login', {
      title: 'Login',
      error: '尝试次数过多，请 ' + LOCKOUT_MINUTES + ' 分钟后再试',
      showCaptcha: true,
      captchaQuestion: captchaData.question
    });
  }

  if (!username || !password) {
    const showCaptcha = needsCaptcha(record);
    let captchaQuestion = '';
    if (showCaptcha) {
      const captchaData = generateCaptcha();
      req.session.captchaAnswer = captchaData.answer;
      captchaQuestion = captchaData.question;
    }
    return res.render('login', { title: 'Login', error: '请输入用户名和密码', showCaptcha, captchaQuestion });
  }

  // Verify captcha if required
  if (needsCaptcha(record)) {
    if (!captcha || captcha.trim() !== req.session.captchaAnswer) {
      recordFailedAttempt(ip);
      const captchaData = generateCaptcha();
      req.session.captchaAnswer = captchaData.answer;
      return res.render('login', {
        title: 'Login',
        error: '验证码错误',
        showCaptcha: true,
        captchaQuestion: captchaData.question
      });
    }
  }

  const user = db.prepare('SELECT id, username, password FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    recordFailedAttempt(ip);
    const updatedRecord = getAttemptRecord(ip);
    const showCaptcha = needsCaptcha(updatedRecord);
    let captchaQuestion = '';
    if (showCaptcha) {
      const captchaData = generateCaptcha();
      req.session.captchaAnswer = captchaData.answer;
      captchaQuestion = captchaData.question;
    }
    const remaining = MAX_ATTEMPTS - (updatedRecord ? updatedRecord.attempt_count : 0);
    let errorMsg = '用户名或密码错误';
    if (remaining > 0 && remaining <= 3) {
      errorMsg += '，还剩 ' + remaining + ' 次尝试机会';
    }
    if (showCaptcha) {
      errorMsg = '用户名或密码错误，请完成验证码';
    }
    return res.render('login', { title: 'Login', error: errorMsg, showCaptcha, captchaQuestion });
  }

  // Success — reset attempts
  resetAttempts(ip);
  req.session.captchaAnswer = null;
  req.session.userId = user.id;
  req.session.username = user.username;

  res.redirect('/');
});

// POST /logout - destroy session
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('todu.sid');
    res.redirect('/login');
  });
});

// POST /change-password - change current user's password
router.post('/change-password', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const { old_password, new_password, confirm_password } = req.body;

  if (!old_password || !new_password || !confirm_password) {
    return res.status(400).json({ error: '请填写所有字段' });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({ error: '两次输入的新密码不一致' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: '新密码不能少于6位' });
  }

  if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
    return res.status(400).json({ error: '新密码必须包含字母和数字' });
  }

  const user = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (!bcrypt.compareSync(old_password, user.password)) {
    return res.status(400).json({ error: '旧密码不正确' });
  }

  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hashed, user.id);

  res.json({ success: true, message: '密码修改成功' });
});

module.exports = router;
