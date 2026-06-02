const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { ensureYearsReady, getHolidayMapByDates, getHolidayStatusMapByDates } = require('../services/holidayService');
const { getWeatherDisplayState, getCalendarWeatherByDates, getCityHistory } = require('../services/weatherService');
const { getSolarTermMapByDates } = require('../services/solarTermService');
const { getTraditionalFestivalMapByDates } = require('../services/traditionalFestivalService');
const { getNoteDatesForMonth, getNotesForDate } = require('../services/noteService');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidIsoDateString(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return utcDate.getUTCFullYear() === year
    && utcDate.getUTCMonth() + 1 === month
    && utcDate.getUTCDate() === day;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getMonthDates(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(formatDate(new Date(year, month - 1, d)));
  }
  return dates;
}

function getFirstDayOffset(year, month) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function parseMonth(str) {
  if (!str || !/^\d{4}-\d{2}$/.test(str)) return null;
  const [y, m] = str.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function formatMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function prevMonth(year, month) {
  if (month === 1) return formatMonth(year - 1, 12);
  return formatMonth(year, month - 1);
}

function nextMonth(year, month) {
  if (month === 12) return formatMonth(year + 1, 1);
  return formatMonth(year, month + 1);
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
  const userId = req.session.userId;
  const today = formatDate(new Date());
  const now = new Date();

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
  const monthDates = getMonthDates(year, month);
  const monthYears = [...new Set(monthDates.map((dateStr) => parseInt(dateStr.slice(0, 4), 10)))];
  await ensureYearsReady(monthYears);
  const holidayMap = getHolidayMapByDates(monthDates);
  const holidayStatusMap = getHolidayStatusMapByDates(monthDates);
  const solarTermMap = getSolarTermMapByDates(monthDates);
  const traditionalFestivalMap = getTraditionalFestivalMapByDates(monthDates);
  const firstDayOffset = getFirstDayOffset(year, month);
  const todayMonth = formatMonth(now.getFullYear(), now.getMonth() + 1);

  const filter = req.query.filter || 'all';

  let todos;
  if (filter === 'completed') {
    todos = db.prepare('SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL AND completed = 1 ORDER BY priority DESC, created_at DESC').all(userId);
  } else if (filter === 'active') {
    todos = db.prepare('SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL AND completed = 0 ORDER BY priority DESC, created_at DESC').all(userId);
  } else {
    todos = db.prepare('SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL ORDER BY priority DESC, completed ASC, created_at DESC').all(userId);
  }

  const topTodoIds = todos.map((todo) => todo.id);
  const subtasksByParent = {};

  if (topTodoIds.length > 0) {
    topTodoIds.forEach((id) => {
      subtasksByParent[id] = [];
    });

    const placeholders = topTodoIds.map(() => '?').join(',');
    const subtasks = db.prepare(
      `SELECT * FROM todos WHERE user_id = ? AND parent_id IN (${placeholders}) ORDER BY completed ASC, created_at ASC`
    ).all(userId, ...topTodoIds);

    subtasks.forEach((subtask) => {
      if (subtasksByParent[subtask.parent_id]) {
        subtasksByParent[subtask.parent_id].push(subtask);
      }
    });
  }

  const monthStart = monthDates[0];
  const monthEnd = monthDates[monthDates.length - 1];
  const monthTodos = db.prepare(
    'SELECT * FROM todos WHERE user_id = ? AND parent_id IS NULL AND due_date >= ? AND due_date <= ? ORDER BY priority DESC, created_at ASC'
  ).all(userId, monthStart, monthEnd);

  const todosByDate = {};
  monthDates.forEach(d => { todosByDate[d] = []; });
  monthTodos.forEach(todo => {
    if (todosByDate[todo.due_date]) {
      todosByDate[todo.due_date].push(todo);
    }
  });

  const allTodos = db.prepare('SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND parent_id IS NULL').get(userId);
  const completedCount = db.prepare('SELECT COUNT(*) as count FROM todos WHERE user_id = ? AND parent_id IS NULL AND completed = 1').get(userId);
  const activeCount = allTodos.count - completedCount.count;
  const weather = await getWeatherDisplayState();
  const weatherCityHistory = getCityHistory();
  const calendarWeatherMap = await getCalendarWeatherByDates(monthDates);
  const notesByDate = {};
  const noteDates = getNoteDatesForMonth(userId, currentMonth);

  monthDates.forEach((dateStr) => {
    notesByDate[dateStr] = [];
  });

  noteDates.forEach((dateStr) => {
    notesByDate[dateStr] = getNotesForDate(userId, dateStr);
  });

  res.render('todos', {
    title: 'My Todos',
    todos,
    filter,
    monthDates,
    firstDayOffset,
    currentMonth,
    subtasksByParent,
    prevMonth: prevMonth(year, month),
    nextMonth: nextMonth(year, month),
    todayMonth,
    today,
    todosByDate,
    holidayMap,
    holidayStatusMap,
    solarTermMap,
    traditionalFestivalMap,
    calendarWeatherMap,
    notesByDate,
    monthYear: year,
    monthNum: month,
    stats: {
      total: allTodos.count,
      completed: completedCount.count,
      active: activeCount
    },
    weather,
    weatherCityHistory
  });
  } catch (error) {
    next(error);
  }
});

router.post('/todos', (req, res) => {
  const userId = req.session.userId;
  const { title, due_date, parent_id, client_today, completed, redirect, project_duration } = req.body;
  const month = req.query.month || req.body.month || '';

  if (!title || !title.trim()) {
    return res.redirect(month ? `/?month=${month}` : '/');
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 500) {
    return res.redirect(month ? `/?month=${month}` : '/');
  }

  const rawDueDate = due_date && due_date.trim() ? due_date.trim() : '';
  const rawClientToday = client_today && String(client_today).trim() ? String(client_today).trim() : '';

  let dueDate = formatDate(new Date());
  if (isValidIsoDateString(rawDueDate)) {
    dueDate = rawDueDate;
  } else if (isValidIsoDateString(rawClientToday)) {
    dueDate = rawClientToday;
  }
  const initialCompleted = parseInt(completed, 10) ? 1 : 0;
  const initialStatus = initialCompleted ? 'done' : 'todo';

  let parentId = null;
  if (parent_id !== undefined && String(parent_id).trim()) {
    const parsedParentId = parseInt(parent_id, 10);
    if (Number.isNaN(parsedParentId)) {
      return res.redirect(month ? `/?month=${month}` : '/');
    }

    const parentTodo = db.prepare(
      'SELECT id FROM todos WHERE id = ? AND user_id = ? AND parent_id IS NULL'
    ).get(parsedParentId, userId);

    if (!parentTodo) {
      return res.redirect(month ? `/?month=${month}` : '/');
    }

    parentId = parsedParentId;
  }

  let duration = 1.0;
  if (project_duration !== undefined && project_duration !== '') {
    const parsed = parseFloat(project_duration);
    if (!isNaN(parsed) && parsed >= 0.5 && parsed % 0.5 === 0) {
      duration = parsed;
    }
  }

  if (initialCompleted) {
    db.prepare(
      'INSERT INTO todos (user_id, title, due_date, parent_id, priority, completed, status, project_duration, completed_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).run(userId, trimmedTitle, dueDate, parentId, initialCompleted, initialStatus, duration);
  } else {
    db.prepare(
      'INSERT INTO todos (user_id, title, due_date, parent_id, priority, completed, status, project_duration) VALUES (?, ?, ?, ?, 0, ?, ?, ?)'
    ).run(userId, trimmedTitle, dueDate, parentId, initialCompleted, initialStatus, duration);
  }

  if (redirect === 'kanban') {
    return res.redirect('/kanban');
  }
  res.redirect(month ? `/?month=${month}` : '/');
});

router.post('/todos/:id/update', (req, res) => {
  const userId = req.session.userId;
  const todoId = req.params.id;
  const month = req.query.month || req.body.month || '';

  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId);
  if (!todo) {
    return res.status(404).send('Todo not found');
  }

  if (req.body.completed !== undefined) {
    const newCompleted = parseInt(req.body.completed) ? 1 : 0;
    const newStatus = newCompleted ? 'done' : 'todo';
    if (newStatus === 'done') {
      db.prepare(`
        UPDATE todos
        SET completed = 1,
            status = 'done',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(todoId, userId);
    } else {
      db.prepare(`
        UPDATE todos
        SET completed = 0,
            status = 'todo',
            in_progress_at = NULL,
            completed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(todoId, userId);
    }
  }

  if (req.body.title !== undefined) {
    const trimmedTitle = req.body.title.trim();
    if (trimmedTitle && trimmedTitle.length <= 500) {
      db.prepare('UPDATE todos SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .run(trimmedTitle, todoId, userId);
    }
  }

  if (req.body.due_date !== undefined) {
    const dueDate = req.body.due_date.trim() || null;
    db.prepare('UPDATE todos SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
      .run(dueDate, todoId, userId);
  }

  if (req.body.project_duration !== undefined && req.body.project_duration !== '') {
    const parsed = parseFloat(req.body.project_duration);
    if (!isNaN(parsed) && parsed >= 0.5 && parsed % 0.5 === 0) {
      db.prepare('UPDATE todos SET project_duration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .run(parsed, todoId, userId);
    }
  }

  res.redirect(month ? `/?month=${month}` : '/');
});

router.post('/todos/:id/delete', (req, res) => {
  const userId = req.session.userId;
  const todoId = req.params.id;
  const month = req.query.month || req.body.month || '';

  const result = db.prepare('DELETE FROM todos WHERE user_id = ? AND (id = ? OR parent_id = ?)').run(userId, todoId, todoId);

  if (result.changes === 0) {
    return res.status(404).send('Todo not found');
  }

  res.redirect(month ? `/?month=${month}` : '/');
});

router.post('/todos/:id/priority', (req, res) => {
  const userId = req.session.userId;
  const todoId = req.params.id;
  const month = req.query.month || req.body.month || '';

  const todo = db.prepare('SELECT id, parent_id, priority FROM todos WHERE id = ? AND user_id = ?').get(todoId, userId);
  if (!todo) {
    return res.status(404).send('Todo not found');
  }

  if (todo.parent_id !== null) {
    return res.status(400).send('Only top-level todos can change priority');
  }

  const nextPriority = todo.priority ? 0 : 1;
  db.prepare('UPDATE todos SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .run(nextPriority, todoId, userId);

  res.redirect(month ? `/?month=${month}` : '/');
});

module.exports = router;
