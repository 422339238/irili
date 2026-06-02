const db = require('../db/database');
const config = require('../config');

const WEATHER_STATE_ID = 1;
const WEATHER_ICON_BASE_PATH = '/icons/weather';
const ICON_CODE_REGEX = /^\d{3}$/;
const FORECAST_ENDPOINTS = [
  'v7/weather/30d',
  'v7/weather/15d',
  'v7/weather/10d',
  'v7/weather/7d',
  'v7/weather/3d'
];
const HISTORICAL_MAX_LOOKBACK_DAYS = 7;
const FORECAST_CACHE_MINUTES = Math.max(5, Math.min(config.weatherFetchIntervalMinutes, 60));
let refreshInFlight = null;
let forecastCache = {
  locationId: '',
  fetchedAtMs: 0,
  byDate: {}
};

function normalizeLocationId(rawValue) {
  return String(rawValue || '').trim();
}

function ensureStateRow() {
  const defaultLocationId = normalizeLocationId(config.weatherLocation);
  const defaultLocationName = String(config.weatherLocationName || defaultLocationId).trim() || defaultLocationId;

  db.prepare(`
    INSERT OR IGNORE INTO weather_state (
      id,
      enabled,
      request_count,
      weather_location,
      weather_location_name
    ) VALUES (?, ?, 0, ?, ?)
  `).run(
    WEATHER_STATE_ID,
    config.weatherAutoFetchDefault ? 1 : 0,
    defaultLocationId,
    defaultLocationName
  );
}

function getLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ensureDailyReset(stateRow) {
  const today = getLocalDateString();
  if (stateRow && stateRow.request_count_date === today) {
    return;
  }
  db.prepare(`
    UPDATE weather_state
    SET request_count = 0, request_count_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(today, WEATHER_STATE_ID);
}

function getStateRow() {
  ensureStateRow();
  const row = db.prepare('SELECT * FROM weather_state WHERE id = ?').get(WEATHER_STATE_ID);
  ensureDailyReset(row);
  return db.prepare('SELECT * FROM weather_state WHERE id = ?').get(WEATHER_STATE_ID);
}

function toBoolean(value) {
  return Number(value) === 1;
}

function normalizeIconCode(rawValue) {
  const iconCode = String(rawValue || '').trim();
  if (!ICON_CODE_REGEX.test(iconCode)) {
    return '999';
  }
  return iconCode;
}

function getCurrentLocationId(stateRow) {
  const rowLocation = stateRow && stateRow.weather_location ? stateRow.weather_location : '';
  const fallback = config.weatherLocation || '';
  return normalizeLocationId(rowLocation || fallback);
}

function getCurrentLocationName(stateRow) {
  const rowName = stateRow && stateRow.weather_location_name ? String(stateRow.weather_location_name).trim() : '';
  if (rowName) {
    return rowName;
  }
  const fallbackName = String(config.weatherLocationName || '').trim();
  if (fallbackName) {
    return fallbackName;
  }
  return getCurrentLocationId(stateRow);
}

function buildIconUrl(iconCode) {
  return `${WEATHER_ICON_BASE_PATH}/${iconCode}.svg`;
}

function isConfigReady() {
  return Boolean(
    config.weatherApiBaseUrl
    && (config.weatherApiToken || config.weatherApiKey)
  );
}

function shouldRefresh(stateRow) {
  if (!stateRow) {
    return false;
  }
  if (!toBoolean(stateRow.enabled)) {
    return false;
  }

  const requestCount = Number(stateRow.request_count) || 0;
  if (requestCount >= config.weatherMaxRequests) {
    return false;
  }

  if (!isConfigReady()) {
    return false;
  }
  if (!getCurrentLocationId(stateRow)) {
    return false;
  }

  if (!stateRow.last_fetched_at) {
    return true;
  }

  const lastFetchedMs = Date.parse(stateRow.last_fetched_at);
  if (Number.isNaN(lastFetchedMs)) {
    return true;
  }

  const intervalMs = config.weatherFetchIntervalMinutes * 60 * 1000;
  return Date.now() - lastFetchedMs >= intervalMs;
}

function buildWeatherApiUrl(pathname, locationId, extraParams = null) {
  const baseUrl = config.weatherApiBaseUrl.endsWith('/')
    ? config.weatherApiBaseUrl
    : `${config.weatherApiBaseUrl}/`;
  const url = new URL(pathname, baseUrl);
  url.searchParams.set('location', locationId);
  url.searchParams.set('lang', config.weatherLang);
  url.searchParams.set('unit', config.weatherUnit);

  if (extraParams && typeof extraParams === 'object') {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  if (!config.weatherApiToken && config.weatherApiKey) {
    url.searchParams.set('key', config.weatherApiKey);
  }
  return url.toString();
}

async function fetchWeatherPayload(pathname, locationId, extraParams = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.weatherRequestTimeoutMs);

  try {
    const headers = {
      Accept: 'application/json'
    };

    if (config.weatherApiToken) {
      headers.Authorization = `Bearer ${config.weatherApiToken}`;
    }

    const response = await fetch(buildWeatherApiUrl(pathname, locationId, extraParams), {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || payload.code !== '200') {
      throw new Error(`API ${payload && payload.code ? payload.code : 'unknown'}`);
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchNowWeather(locationId) {
  const payload = await fetchWeatherPayload('v7/weather/now', locationId);
  if (!payload.now) {
    throw new Error('API now missing');
  }
  return payload;
}

async function fetchForecastWeather(locationId) {
  let lastError = null;

  for (const endpoint of FORECAST_ENDPOINTS) {
    try {
      const payload = await fetchWeatherPayload(endpoint, locationId);
      if (Array.isArray(payload.daily) && payload.daily.length > 0) {
        return payload;
      }
      lastError = new Error(`API daily missing for ${endpoint}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('天气预报获取失败');
}

function toShortError(error) {
  const message = error && error.message ? String(error.message) : '天气获取失败';
  return message.slice(0, 200);
}

function isIsoDateString(dateStr) {
  return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function toLocalIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateKey(dateStr) {
  return String(dateStr || '').replace(/-/g, '');
}

function dateToUtcMs(dateStr) {
  if (!isIsoDateString(dateStr)) {
    return NaN;
  }
  const [year, month, day] = dateStr.split('-').map((v) => parseInt(v, 10));
  return Date.UTC(year, month - 1, day);
}

function diffDays(fromDateStr, toDateStr) {
  const fromMs = dateToUtcMs(fromDateStr);
  const toMs = dateToUtcMs(toDateStr);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return Number.NaN;
  }
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function buildTempRange(tempMin, tempMax) {
  const min = String(tempMin || '').trim();
  const max = String(tempMax || '').trim();
  if (min && max) {
    return `${min}~${max}°`;
  }
  if (max) {
    return `${max}°`;
  }
  if (min) {
    return `${min}°`;
  }
  return '';
}

function normalizeDailyItem(item) {
  const fxDate = String(item && item.fxDate ? item.fxDate : '').trim();
  if (!isIsoDateString(fxDate)) {
    return null;
  }

  const text = String(item && (item.textDay || item.textNight) ? (item.textDay || item.textNight) : '').trim();
  const iconCode = normalizeIconCode(item && (item.iconDay || item.iconNight));
  const tempMin = String(item && item.tempMin ? item.tempMin : '').trim();
  const tempMax = String(item && item.tempMax ? item.tempMax : '').trim();
  const tempRange = buildTempRange(tempMin, tempMax);

  return {
    date: fxDate,
    text: text || '天气',
    iconCode,
    iconUrl: buildIconUrl(iconCode),
    tempMin,
    tempMax,
    tempRange,
    approximate: false,
    approximateFrom: ''
  };
}

function buildForecastMap(payload) {
  const result = {};
  const dailyList = Array.isArray(payload && payload.daily) ? payload.daily : [];

  dailyList.forEach((item) => {
    const normalized = normalizeDailyItem(item);
    if (!normalized) {
      return;
    }
    result[normalized.date] = normalized;
  });

  return result;
}

function pickHistoricalHour(hourlyList) {
  const hours = Array.isArray(hourlyList) ? hourlyList : [];
  if (hours.length === 0) {
    return null;
  }

  const preferredHour = hours.find((item) => {
    const time = String(item && item.time ? item.time : '');
    return time.includes('T12:') || time.includes('T13:');
  });

  if (preferredHour) {
    return preferredHour;
  }

  return hours[Math.floor(hours.length / 2)] || hours[0];
}

function normalizeHistoricalItem(payload) {
  const daily = payload && payload.weatherDaily ? payload.weatherDaily : null;
  const dateStr = String(daily && daily.date ? daily.date : '').trim();
  if (!isIsoDateString(dateStr)) {
    return null;
  }

  const hour = pickHistoricalHour(payload && payload.weatherHourly);
  const text = String(hour && hour.text ? hour.text : '').trim();
  const iconCode = normalizeIconCode(hour && hour.icon);
  const tempMin = String(daily && daily.tempMin ? daily.tempMin : '').trim();
  const tempMax = String(daily && daily.tempMax ? daily.tempMax : '').trim();
  const tempRange = buildTempRange(tempMin, tempMax);

  return {
    date: dateStr,
    text: text || '历史天气',
    iconCode,
    iconUrl: buildIconUrl(iconCode),
    tempMin,
    tempMax,
    tempRange,
    approximate: false,
    approximateFrom: ''
  };
}

function cloneWeatherItemForDate(item, targetDate, approximateFrom) {
  return {
    date: targetDate,
    text: String(item && item.text ? item.text : '天气'),
    iconCode: normalizeIconCode(item && item.iconCode),
    iconUrl: buildIconUrl(normalizeIconCode(item && item.iconCode)),
    tempMin: String(item && item.tempMin ? item.tempMin : ''),
    tempMax: String(item && item.tempMax ? item.tempMax : ''),
    tempRange: String(item && item.tempRange ? item.tempRange : ''),
    approximate: true,
    approximateFrom: approximateFrom || ''
  };
}

function fillMissingDatesByNearest(uniqueDates, weatherMap, candidateMap = null) {
  const sourceMap = candidateMap || weatherMap || {};
  const availableDates = Object.keys(sourceMap).filter(isIsoDateString);
  if (availableDates.length === 0) {
    return weatherMap || {};
  }

  const candidates = availableDates.map((dateStr) => ({
    date: dateStr,
    ms: dateToUtcMs(dateStr),
    item: sourceMap[dateStr]
  })).filter((entry) => !Number.isNaN(entry.ms));

  if (candidates.length === 0) {
    return weatherMap || {};
  }

  uniqueDates.forEach((targetDate) => {
    if (!isIsoDateString(targetDate) || weatherMap[targetDate]) {
      return;
    }

    const targetMs = dateToUtcMs(targetDate);
    if (Number.isNaN(targetMs)) {
      return;
    }

    let best = candidates[0];
    let bestDiff = Math.abs(candidates[0].ms - targetMs);

    for (let i = 1; i < candidates.length; i += 1) {
      const diff = Math.abs(candidates[i].ms - targetMs);
      if (diff < bestDiff) {
        best = candidates[i];
        bestDiff = diff;
      }
    }

    weatherMap[targetDate] = cloneWeatherItemForDate(best.item, targetDate, best.date);
  });

  return weatherMap;
}

function isForecastCacheValid(locationId) {
  if (!forecastCache || typeof forecastCache !== 'object') {
    return false;
  }
  if (forecastCache.locationId !== locationId) {
    return false;
  }

  const cacheAgeMs = Date.now() - Number(forecastCache.fetchedAtMs || 0);
  return cacheAgeMs >= 0 && cacheAgeMs < FORECAST_CACHE_MINUTES * 60 * 1000;
}

async function loadForecastMap(locationId) {
  if (isForecastCacheValid(locationId)) {
    return forecastCache.byDate || {};
  }

  const payload = await fetchForecastWeather(locationId);
  const byDate = buildForecastMap(payload);

  forecastCache = {
    locationId,
    fetchedAtMs: Date.now(),
    byDate
  };

  return byDate;
}

async function loadHistoricalDateItem(locationId, dateStr) {
  const payload = await fetchWeatherPayload('v7/historical/weather', locationId, {
    date: toDateKey(dateStr)
  });
  return normalizeHistoricalItem(payload);
}

function updateStateSuccess(payload, fetchedAt, locationId, locationName) {
  const now = payload.now || {};
  const weatherText = String(now.text || '').trim().slice(0, 80);
  const weatherTemp = String(now.temp || '').trim().slice(0, 16);
  const weatherIcon = normalizeIconCode(now.icon);
  const weatherObsTime = String(now.obsTime || '').trim().slice(0, 64) || null;
  const weatherUpdateTime = String(payload.updateTime || '').trim().slice(0, 64) || null;

  db.prepare(`
    UPDATE weather_state
    SET
      request_count = request_count + 1,
      last_fetched_at = ?,
      weather_text = ?,
      weather_temp = ?,
      weather_icon = ?,
      weather_obs_time = ?,
      weather_update_time = ?,
      weather_location = ?,
      weather_location_name = ?,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    fetchedAt,
    weatherText,
    weatherTemp,
    weatherIcon,
    weatherObsTime,
    weatherUpdateTime,
    locationId,
    locationName || locationId,
    WEATHER_STATE_ID
  );
}

function updateStateFailure(error, fetchedAt) {
  db.prepare(`
    UPDATE weather_state
    SET
      request_count = request_count + 1,
      last_fetched_at = ?,
      last_error = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(fetchedAt, toShortError(error), WEATHER_STATE_ID);
}

async function refreshWeatherNow() {
  const stateRow = getStateRow();
  const locationId = getCurrentLocationId(stateRow);
  const locationName = getCurrentLocationName(stateRow);
  if (!locationId) {
    return;
  }

  const fetchedAt = new Date().toISOString();

  try {
    const payload = await fetchNowWeather(locationId);
    updateStateSuccess(payload, fetchedAt, locationId, locationName);
  } catch (error) {
    updateStateFailure(error, fetchedAt);
    console.error('[weather-sync] refresh failed:', toShortError(error));
  }
}

async function refreshWeatherWithLock() {
  if (!refreshInFlight) {
    refreshInFlight = refreshWeatherNow().finally(() => {
      refreshInFlight = null;
    });
  }

  await refreshInFlight;
}

function buildDisplayState(stateRow) {
  const locationId = getCurrentLocationId(stateRow);
  const locationName = getCurrentLocationName(stateRow);
  const requestCount = Number(stateRow && stateRow.request_count) || 0;
  const maxRequests = config.weatherMaxRequests;
  const limitReached = requestCount >= maxRequests;
  const available = Boolean(
    stateRow
    && typeof stateRow.weather_text === 'string'
    && stateRow.weather_text.trim()
    && typeof stateRow.weather_temp === 'string'
    && stateRow.weather_temp.trim()
  );

  let message = '天气加载中';
  if (!isConfigReady()) {
    message = '天气配置缺失';
  } else if (limitReached) {
    message = '已达今日请求上限';
  } else if (stateRow && !toBoolean(stateRow.enabled)) {
    message = '天气更新已关闭';
  } else if (stateRow && stateRow.last_error) {
    message = '天气获取失败';
  }

  const iconCode = normalizeIconCode(stateRow && stateRow.weather_icon);

  return {
    enabled: Boolean(stateRow && toBoolean(stateRow.enabled)),
    intervalMinutes: config.weatherFetchIntervalMinutes,
    requestCount,
    maxRequests,
    remainingRequests: Math.max(maxRequests - requestCount, 0),
    limitReached,
    configReady: isConfigReady(),
    available,
    text: available ? stateRow.weather_text.trim() : '',
    temp: available ? stateRow.weather_temp.trim() : '',
    iconCode,
    iconUrl: buildIconUrl(iconCode),
    location: locationId,
    locationName,
    lastFetchedAt: stateRow && stateRow.last_fetched_at ? stateRow.last_fetched_at : null,
    lastError: stateRow && stateRow.last_error ? stateRow.last_error : null,
    message
  };
}

async function getWeatherDisplayState() {
  const current = getStateRow();
  if (shouldRefresh(current)) {
    await refreshWeatherWithLock();
  }

  return buildDisplayState(getStateRow());
}

async function getCalendarWeatherByDates(dateList) {
  const uniqueDates = [...new Set((Array.isArray(dateList) ? dateList : []).filter(isIsoDateString))];
  if (uniqueDates.length === 0) {
    return {};
  }

  const stateRow = getStateRow();
  const locationId = getCurrentLocationId(stateRow);
  if (!isConfigReady() || !locationId) {
    return {};
  }

  const result = {};
  const candidatePool = {};

  try {
    const forecastMap = await loadForecastMap(locationId);
    Object.assign(candidatePool, forecastMap);
    uniqueDates.forEach((dateStr) => {
      if (forecastMap[dateStr]) {
        result[dateStr] = forecastMap[dateStr];
      }
    });
  } catch (error) {
    console.error('[weather-sync] forecast fetch failed:', toShortError(error));
  }

  const today = toLocalIsoDate();
  const missingPastDates = uniqueDates.filter((dateStr) => {
    if (result[dateStr]) {
      return false;
    }

    if (dateStr >= today) {
      return false;
    }

    const lookbackDays = diffDays(dateStr, today);
    return Number.isFinite(lookbackDays)
      && lookbackDays >= 1
      && lookbackDays <= HISTORICAL_MAX_LOOKBACK_DAYS;
  });

  if (missingPastDates.length > 0) {
    const historyTasks = missingPastDates.map(async (dateStr) => {
      try {
        const historicalItem = await loadHistoricalDateItem(locationId, dateStr);
        if (historicalItem) {
          result[dateStr] = historicalItem;
          candidatePool[dateStr] = historicalItem;
        }
      } catch (error) {
        // Individual historical date misses are expected for out-of-range dates.
      }
    });

    await Promise.all(historyTasks);
  }

  fillMissingDatesByNearest(uniqueDates, result, candidatePool);

  return result;
}

function setWeatherAutoFetchEnabled(enabled) {
  ensureStateRow();
  db.prepare(`
    UPDATE weather_state
    SET enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enabled ? 1 : 0, WEATHER_STATE_ID);

  return buildDisplayState(getStateRow());
}

function setWeatherLocation(locationId, locationName) {
  ensureStateRow();

  const nextLocationId = normalizeLocationId(locationId);
  if (!nextLocationId) {
    throw new Error('城市ID不能为空');
  }

  const nextLocationName = String(locationName || nextLocationId).trim().slice(0, 120) || nextLocationId;

  // Save the old city to history before switching
  const oldState = getStateRow();
  const oldLocationId = getCurrentLocationId(oldState);
  const oldLocationName = getCurrentLocationName(oldState);
  if (oldLocationId && oldLocationId !== nextLocationId) {
    addCityToHistory(oldLocationId, oldLocationName);
  }

  db.prepare(`
    UPDATE weather_state
    SET
      weather_location = ?,
      weather_location_name = ?,
      last_fetched_at = NULL,
      weather_text = NULL,
      weather_temp = NULL,
      weather_icon = NULL,
      weather_obs_time = NULL,
      weather_update_time = NULL,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextLocationId, nextLocationName, WEATHER_STATE_ID);

  forecastCache = {
    locationId: '',
    fetchedAtMs: 0,
    byDate: {}
  };

  return buildDisplayState(getStateRow());
}

function getCityHistory(limit = 10) {
  return db.prepare(
    'SELECT location_id, location_name, selected_at FROM weather_city_history ORDER BY selected_at DESC LIMIT ?'
  ).all(limit);
}

function addCityToHistory(locationId, locationName) {
  const id = normalizeLocationId(locationId);
  if (!id) return;
  const name = String(locationName || id).trim().slice(0, 120) || id;

  db.prepare(`
    INSERT INTO weather_city_history (location_id, location_name, selected_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(location_id) DO UPDATE SET
      location_name = excluded.location_name,
      selected_at = CURRENT_TIMESTAMP
  `).run(id, name);

  // Prune beyond 10 entries
  db.prepare(`
    DELETE FROM weather_city_history
    WHERE id NOT IN (
      SELECT id FROM weather_city_history ORDER BY selected_at DESC LIMIT 10
    )
  `).run();
}

function removeCityFromHistory(locationId) {
  const id = normalizeLocationId(locationId);
  if (!id) return;
  db.prepare('DELETE FROM weather_city_history WHERE location_id = ?').run(id);
}

function getWeatherStateSnapshot() {
  return buildDisplayState(getStateRow());
}

module.exports = {
  getWeatherDisplayState,
  getCalendarWeatherByDates,
  getWeatherStateSnapshot,
  setWeatherAutoFetchEnabled,
  setWeatherLocation,
  getCityHistory,
  addCityToHistory,
  removeCityFromHistory
};
