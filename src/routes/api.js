const express = require('express');
const router = express.Router();
const { requireNotesApiKey } = require('../middleware/notesApiAuth');
const { getNoteDay, getPaginatedNoteDays } = require('../services/noteService');

function isValidDateStr(dateStr) {
  return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function getServerTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function buildMeta() {
  return {
    generatedAt: new Date().toISOString(),
    timezone: getServerTimezone(),
    version: 'v1'
  };
}

router.use('/api/v1', requireNotesApiKey);

router.get('/api/v1/notes/days', (req, res) => {
  const result = getPaginatedNoteDays(
    req.apiUser.id,
    req.query.page,
    req.query.pageSize
  );

  res.json({
    items: result.items,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      hasMore: result.hasMore
    },
    meta: buildMeta()
  });
});

router.get('/api/v1/notes/days/:date', (req, res) => {
  const dateStr = String(req.params.date || '').trim();
  if (!isValidDateStr(dateStr)) {
    return res.status(400).json({
      error: 'Invalid date'
    });
  }

  res.json({
    item: getNoteDay(req.apiUser.id, dateStr),
    meta: buildMeta()
  });
});

module.exports = router;
