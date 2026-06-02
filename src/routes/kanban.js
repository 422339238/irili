const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/kanban', (req, res) => {
  const userId = req.session.userId;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const todoItems = db.prepare(
    "SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL AND status = 'todo' ORDER BY sort_order ASC, priority DESC, created_at DESC"
  ).all(userId);

  const inProgressItems = db.prepare(
    "SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL AND status = 'in_progress' ORDER BY sort_order ASC, priority DESC, created_at DESC"
  ).all(userId);

  const doneItems = db.prepare(
    "SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL AND status = 'done' ORDER BY sort_order ASC, priority DESC, COALESCE(completed_at, updated_at) DESC"
  ).all(userId);

  res.render('kanban', {
    title: '看板 - Todu',
    todoItems,
    inProgressItems,
    doneItems,
    today: todayStr
  });
});

router.post('/kanban/todos/:id/status', (req, res) => {
  const userId = req.session.userId;
  const todoId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['todo', 'in_progress', 'done'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: todo, in_progress, done' });
  }

  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  if (todo.status === status) {
    return res.json({ success: true, todo });
  }

  if (status === 'todo') {
    db.prepare(`
      UPDATE todos
      SET status = 'todo',
          completed = 0,
          in_progress_at = NULL,
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(todoId, userId);
  } else if (status === 'in_progress') {
    db.prepare(`
      UPDATE todos
      SET status = 'in_progress',
          completed = 0,
          in_progress_at = CURRENT_TIMESTAMP,
          completed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(todoId, userId);
  } else {
    db.prepare(`
      UPDATE todos
      SET status = 'done',
          completed = 1,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(todoId, userId);
  }

  const updated = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId);
  res.json({ success: true, todo: updated });
});

router.post('/kanban/todos/:id/update', (req, res) => {
  const userId = req.session.userId;
  const todoId = req.params.id;

  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  const { title, due_date, project_duration } = req.body;

  if (title !== undefined) {
    const trimmed = String(title).trim();
    if (trimmed && trimmed.length <= 500) {
      db.prepare('UPDATE todos SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .run(trimmed, todoId, userId);
    }
  }

  if (due_date !== undefined) {
    const d = String(due_date).trim() || null;
    db.prepare('UPDATE todos SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
      .run(d, todoId, userId);
  }

  if (project_duration !== undefined && project_duration !== '') {
    const parsed = parseFloat(project_duration);
    if (!isNaN(parsed) && parsed >= 0.5 && parsed % 0.5 === 0) {
      db.prepare('UPDATE todos SET project_duration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .run(parsed, todoId, userId);
    }
  }

  const updated = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId);
  res.json({ success: true, todo: updated });
});

router.post('/kanban/reorder', (req, res) => {
  const userId = req.session.userId;
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return res.status(400).json({ error: 'orderedIds must be a non-empty array' });
  }

  const updateStmt = db.prepare('UPDATE todos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  const updateAll = db.transaction((ids) => {
    ids.forEach((id, index) => {
      updateStmt.run(index, id, userId);
    });
  });

  try {
    updateAll(orderedIds);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering todos:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

module.exports = router;
