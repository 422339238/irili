const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getNotesForDate,
  getNoteDatesForMonth,
  getAllNoteDates,
  appendNote,
  updateNoteEntry,
  deleteNote
} = require('../services/noteService');

function parseMonth(str) {
  if (!str || !/^\d{4}-\d{2}$/.test(str)) return null;
  const [y, m] = str.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function formatMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}


function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

router.use(requireAuth);

// 获取所有笔记条目（排序后）
function getAllSortedEntries(userId) {
  const allDates = getAllNoteDates(userId);
  const allEntries = [];
  allDates.forEach(dateStr => {
    const dayNotes = getNotesForDate(userId, dateStr);
    dayNotes.forEach((entry, idx) => {
      allEntries.push({ date: dateStr, entry, noteIndex: idx });
    });
  });

  allEntries.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.noteIndex - a.noteIndex;
  });
  return allEntries;
}

// GET /notes — 笔记独立页面（显示所有笔记，分页）
router.get('/notes', (req, res) => {
  const userId = req.session.userId;
  const now = new Date();
  const today = formatDate(now);
  const todayMonth = formatMonth(now.getFullYear(), now.getMonth() + 1);

  // month 参数仅用于新建笔记的默认月份
  let year, month;
  const parsed = parseMonth(req.query.month);
  if (parsed) {
    year = parsed.year;
    month = parsed.month;
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const currentMonth = formatMonth(year, month);

  const allEntries = getAllSortedEntries(userId);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(allEntries.length / pageSize));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
  const pagedEntries = allEntries.slice((page - 1) * pageSize, page * pageSize);

  res.render('notes', {
    title: '笔记',
    entries: pagedEntries,
    page,
    totalPages,
    totalEntries: allEntries.length,
    currentMonth,
    todayMonth,
    today,
    monthYear: year,
    monthNum: month
  });
});

// GET /notes/api/entries — 无限滚动 JSON 接口
router.get('/notes/api/entries', (req, res) => {
  const userId = req.session.userId;
  const allEntries = getAllSortedEntries(userId);

  const pageSize = 20;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const totalPages = Math.max(1, Math.ceil(allEntries.length / pageSize));
  const pagedEntries = allEntries.slice((page - 1) * pageSize, page * pageSize);

  res.json({
    entries: pagedEntries,
    page,
    totalPages,
    hasMore: page < totalPages
  });
});

// POST /notes — 追加一条笔记
router.post('/notes', (req, res) => {
  const userId = req.session.userId;
  const { content, date, month, redirect, client_time } = req.body;
  const trimmedContent = (content || '').trim();

  if (!trimmedContent) {
    const fallbackMonth = month || formatMonth(new Date().getFullYear(), new Date().getMonth() + 1);
    if (redirect === 'kanban') {
      return res.redirect('/kanban');
    }
    if (redirect === 'calendar') {
      return res.redirect(`/?month=${fallbackMonth}`);
    }
    return res.redirect(`/notes?month=${fallbackMonth}`);
  }

  const now = new Date();
  let targetDate;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    targetDate = date;
  } else {
    targetDate = formatDate(now);
  }

  appendNote(userId, targetDate, trimmedContent, client_time);

  // 如果是从看板来的，重定向回看板
  if (redirect === 'kanban') {
    return res.redirect('/kanban');
  }

  // 如果是从日历弹框来的，重定向回日历
  if (redirect === 'calendar') {
    const m = month || formatMonth(now.getFullYear(), now.getMonth() + 1);
    return res.redirect(`/?month=${m}`);
  }

  const m = month || formatMonth(parseInt(targetDate.slice(0, 4), 10), parseInt(targetDate.slice(5, 7), 10));
  res.redirect(`/notes?month=${m}`);
});

// POST /notes/:date/update — 更新某天第 N 条笔记
router.post('/notes/:date/update', (req, res) => {
  const userId = req.session.userId;
  const dateStr = req.params.date;
  const { content, noteIndex, month } = req.body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).send('Invalid date');
  }

  updateNoteEntry(userId, dateStr, noteIndex, content || '');

  const m = month || formatMonth(parseInt(dateStr.slice(0, 4), 10), parseInt(dateStr.slice(5, 7), 10));
  res.redirect(`/notes?month=${m}`);
});

// POST /notes/:date/delete — 删除某天第 N 条笔记
router.post('/notes/:date/delete', (req, res) => {
  const userId = req.session.userId;
  const dateStr = req.params.date;
  const { noteIndex, month } = req.body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).send('Invalid date');
  }

  deleteNote(userId, dateStr, noteIndex);

  const m = month || formatMonth(parseInt(dateStr.slice(0, 4), 10), parseInt(dateStr.slice(5, 7), 10));
  res.redirect(`/notes?month=${m}`);
});

module.exports = router;
