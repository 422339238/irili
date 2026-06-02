require('dotenv').config();

const path = require('path');

const defaultDbPath = path.join(__dirname, '..', 'data', 'todu.db');
const dbPath = process.env.DB_PATH || defaultDbPath;
const defaultHolidayCacheDir = path.join(__dirname, '..', 'data', 'holidays');
const defaultWeatherLocationListCacheDir = path.join(__dirname, '..', 'data', 'locations');
const defaultNotesDataDir = path.join(__dirname, '..', 'data', 'notes');

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return fallback;
}

function parseInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === '') {
    throw new Error(`${name} must be set in environment variables or .env`);
  }
  return value;
}

function resolveSessionCookieSecure(nodeEnv, rawValue) {
  const value = (rawValue || '').toLowerCase();

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'auto') {
    return 'auto';
  }

  return nodeEnv === 'production' ? 'auto' : false;
}

function resolveHttpsBaseUrl(rawValue) {
  const normalized = (rawValue || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT || 3000,
  adminUsername: requireEnv('ADMIN_USERNAME'),
  sessionSecret: requireEnv('SESSION_SECRET'),
  nodeEnv,
  dbPath,
  notesDataDir: process.env.NOTES_DATA_DIR || defaultNotesDataDir,
  sessionDbDir: process.env.SESSION_DB_DIR || path.dirname(dbPath),
  sessionCookieSecure: resolveSessionCookieSecure(nodeEnv, process.env.SESSION_COOKIE_SECURE),
  sessionRolling: parseBoolean(process.env.SESSION_ROLLING, true),
  sessionMaxAgeDays: Math.max(1, parseInteger(process.env.SESSION_MAX_AGE_DAYS, 365)),
  holidaySyncEnabled: parseBoolean(process.env.HOLIDAY_SYNC_ENABLED, true),
  holidaySyncIntervalHours: parseInteger(process.env.HOLIDAY_SYNC_INTERVAL_HOURS, 24 * 365),
  holidayRequestTimeoutMs: parseInteger(process.env.HOLIDAY_REQUEST_TIMEOUT_MS, 10000),
  holidaySourcePrimary: resolveHttpsBaseUrl(process.env.HOLIDAY_SOURCE_PRIMARY),
  holidaySourceFallback: resolveHttpsBaseUrl(process.env.HOLIDAY_SOURCE_FALLBACK),
  holidayCacheDir: process.env.HOLIDAY_CACHE_DIR || defaultHolidayCacheDir,
  weatherApiBaseUrl: resolveHttpsBaseUrl(process.env.WEATHER_API_BASE_URL),
  weatherApiKey: process.env.WEATHER_API_KEY || '',
  weatherApiToken: process.env.WEATHER_API_TOKEN || '',
  weatherLocation: process.env.WEATHER_LOCATION || '101010100',
  weatherLocationName: process.env.WEATHER_LOCATION_NAME || '',
  weatherLang: process.env.WEATHER_LANG || 'zh',
  weatherUnit: process.env.WEATHER_UNIT || 'm',
  weatherRequestTimeoutMs: Math.max(1000, parseInteger(process.env.WEATHER_REQUEST_TIMEOUT_MS, 10000)),
  weatherFetchIntervalMinutes: Math.max(1, parseInteger(process.env.WEATHER_FETCH_INTERVAL_MINUTES, 30)),
  weatherMaxRequests: Math.max(1, parseInteger(process.env.WEATHER_MAX_REQUESTS, 1000)),
  weatherAutoFetchDefault: parseBoolean(process.env.WEATHER_AUTO_FETCH_DEFAULT, true),
  weatherLocationListUrl: resolveHttpsBaseUrl(process.env.WEATHER_LOCATION_LIST_URL),
  weatherLocationListCacheDir: process.env.WEATHER_LOCATION_LIST_CACHE_DIR || defaultWeatherLocationListCacheDir,
  weatherLocationListRefreshHours: Math.max(1, parseInteger(process.env.WEATHER_LOCATION_LIST_REFRESH_HOURS, 24)),
  weatherLocationListRequestTimeoutMs: Math.max(1000, parseInteger(process.env.WEATHER_LOCATION_LIST_REQUEST_TIMEOUT_MS, 15000)),
};
