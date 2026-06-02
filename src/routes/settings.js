const express = require('express');
const router = express.Router();
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { getWeatherDisplayState, getCityHistory } = require('../services/weatherService');
const { getNotesApiKeyMeta, resetNotesApiKey } = require('../services/notesApiKeyService');

function buildBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

router.use(requireAuth);

router.get('/settings', async (req, res, next) => {
  try {
    const isAdmin = req.session.username === config.adminUsername;
    const baseUrl = buildBaseUrl(req);
    const notesApiKeyMeta = getNotesApiKeyMeta(req.session.userId);
    const weather = isAdmin ? await getWeatherDisplayState() : null;
    const weatherCityHistory = isAdmin ? getCityHistory() : [];

    res.render('settings', {
      title: '设置',
      notesApiKeyMeta,
      notesApiBaseUrl: `${baseUrl}/api/v1`,
      notesApiDaysUrl: `${baseUrl}/api/v1/notes/days`,
      notesApiDayExampleUrl: `${baseUrl}/api/v1/notes/days/2026-04-16`,
      weather,
      weatherCityHistory
    });
  } catch (error) {
    next(error);
  }
});

router.post('/settings/api-access/key/reset', (req, res) => {
  const result = resetNotesApiKey(req.session.userId);
  res.json({
    ok: true,
    apiKey: result.apiKey,
    meta: result.meta
  });
});

module.exports = router;
