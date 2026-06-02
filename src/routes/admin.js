const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { refreshCurrentAndNextYear } = require('../services/holidayService');
const { setWeatherAutoFetchEnabled, setWeatherLocation, getWeatherDisplayState, getCityHistory, removeCityFromHistory } = require('../services/weatherService');
const { searchChinaCities, getChinaCityById } = require('../services/locationListService');

router.post('/admin/settings/holiday-sync', requireAdmin, async (req, res) => {
  try {
    await refreshCurrentAndNextYear();
    res.json({ ok: true, message: '节假日数据已更新。' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error && error.message ? error.message : '更新失败，请稍后重试。'
    });
  }
});

function parseEnabled(rawValue) {
  if (rawValue === true || rawValue === 1 || rawValue === '1') {
    return true;
  }
  if (rawValue === false || rawValue === 0 || rawValue === '0') {
    return false;
  }
  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === 'off') {
      return false;
    }
  }
  return null;
}

router.post('/admin/settings/weather-auto-fetch', requireAdmin, (req, res) => {
  const enabled = parseEnabled(req.body && req.body.enabled);
  if (enabled === null) {
    return res.status(400).json({ ok: false, message: '参数错误：enabled' });
  }

  try {
    const weather = setWeatherAutoFetchEnabled(enabled);
    return res.json({
      ok: true,
      enabled: weather.enabled,
      requestCount: weather.requestCount,
      maxRequests: weather.maxRequests,
      remainingRequests: weather.remainingRequests,
      limitReached: weather.limitReached
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error && error.message ? error.message : '保存失败，请稍后重试。'
    });
  }
});

router.get('/admin/settings/weather-locations', requireAdmin, async (req, res) => {
  try {
    const keyword = req.query && req.query.q ? String(req.query.q).trim() : '';
    const locations = await searchChinaCities(keyword, 20);
    return res.json({
      ok: true,
      locations
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error && error.message ? error.message : '城市列表加载失败，请稍后重试。'
    });
  }
});

router.post('/admin/settings/weather-location', requireAdmin, async (req, res) => {
  const locationId = req.body && req.body.locationId ? String(req.body.locationId).trim() : '';
  if (!locationId) {
    return res.status(400).json({ ok: false, message: '参数错误：locationId' });
  }

  try {
    const city = await getChinaCityById(locationId);
    if (!city) {
      return res.status(404).json({ ok: false, message: '未找到该城市ID。' });
    }

    setWeatherLocation(city.id, city.nameZh || city.nameEn || city.id);
    const weather = await getWeatherDisplayState();

    return res.json({
      ok: true,
      locationId: weather.location,
      locationName: weather.locationName,
      weather,
      cityHistory: getCityHistory()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error && error.message ? error.message : '切换城市失败，请稍后重试。'
    });
  }
});

router.get('/admin/settings/weather-city-history', requireAdmin, (req, res) => {
  try {
    return res.json({ ok: true, cityHistory: getCityHistory() });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error && error.message ? error.message : '获取城市历史失败'
    });
  }
});

router.delete('/admin/settings/weather-city-history/:locationId', requireAdmin, (req, res) => {
  const locationId = req.params.locationId ? String(req.params.locationId).trim() : '';
  if (!locationId) {
    return res.status(400).json({ ok: false, message: '参数错误：locationId' });
  }

  try {
    removeCityFromHistory(locationId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error && error.message ? error.message : '删除城市历史失败'
    });
  }
});

module.exports = router;
