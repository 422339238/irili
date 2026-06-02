const fs = require('fs/promises');
const path = require('path');
const config = require('../config');

const holidayOffDayStore = new Map();
const holidayStatusStore = new Map();
let syncTimer = null;

function cacheFilePath(year) {
  return path.join(config.holidayCacheDir, `${year}.json`);
}

function toOffDayMap(payload) {
  const map = new Map();
  const days = Array.isArray(payload && payload.days) ? payload.days : [];

  days.forEach((day) => {
    if (!day || typeof day !== 'object') {
      return;
    }
    if (!day.isOffDay) {
      return;
    }
    if (typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      return;
    }
    if (typeof day.name !== 'string' || !day.name.trim()) {
      return;
    }
    map.set(day.date, day.name.trim());
  });

  return map;
}

function toStatusMap(payload) {
  const map = new Map();
  const days = Array.isArray(payload && payload.days) ? payload.days : [];

  days.forEach((day) => {
    if (!day || typeof day !== 'object') {
      return;
    }
    if (typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      return;
    }
    if (typeof day.name !== 'string' || !day.name.trim()) {
      return;
    }
    if (typeof day.isOffDay !== 'boolean') {
      return;
    }

    map.set(day.date, {
      name: day.name.trim(),
      isOffDay: day.isOffDay
    });
  });

  return map;
}

async function ensureCacheDir() {
  await fs.mkdir(config.holidayCacheDir, { recursive: true });
}

async function loadYearFromCache(year) {
  try {
    const raw = await fs.readFile(cacheFilePath(year), 'utf8');
    const payload = JSON.parse(raw);
    holidayOffDayStore.set(year, toOffDayMap(payload));
    holidayStatusStore.set(year, toStatusMap(payload));
    return true;
  } catch (error) {
    return false;
  }
}

async function writeYearCache(year, payload) {
  await ensureCacheDir();
  await fs.writeFile(cacheFilePath(year), JSON.stringify(payload, null, 2));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.holidayRequestTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchYearFromSource(year) {
  const paths = [
    config.holidaySourcePrimary,
    config.holidaySourceFallback
  ].filter(Boolean).map((source) => `${source}/${year}.json`);

  if (paths.length === 0) {
    throw new Error('HOLIDAY_SOURCE_PRIMARY or HOLIDAY_SOURCE_FALLBACK must be configured');
  }

  let lastError = null;
  for (const url of paths) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to load holiday data for ${year}`);
}

async function syncYear(year) {
  const payload = await fetchYearFromSource(year);
  holidayOffDayStore.set(year, toOffDayMap(payload));
  holidayStatusStore.set(year, toStatusMap(payload));
  await writeYearCache(year, payload);
}

async function ensureYearReady(year) {
  if (holidayOffDayStore.has(year) && holidayStatusStore.has(year)) {
    return;
  }
  const loaded = await loadYearFromCache(year);
  if (loaded) {
    return;
  }
  await syncYear(year);
}

async function ensureYearsReady(years) {
  for (const year of years) {
    await ensureYearReady(year);
  }
}

function getHolidayMapByDates(dateList) {
  const result = {};

  dateList.forEach((dateStr) => {
    if (typeof dateStr !== 'string') {
      return;
    }
    const year = parseInt(dateStr.slice(0, 4), 10);
    const yearMap = holidayOffDayStore.get(year);
    if (!yearMap) {
      return;
    }
    const holidayName = yearMap.get(dateStr);
    if (holidayName) {
      result[dateStr] = holidayName;
    }
  });

  return result;
}

function getHolidayStatusMapByDates(dateList) {
  const result = {};

  dateList.forEach((dateStr) => {
    if (typeof dateStr !== 'string') {
      return;
    }

    const year = parseInt(dateStr.slice(0, 4), 10);
    const yearMap = holidayStatusStore.get(year);
    if (!yearMap) {
      return;
    }

    const dayStatus = yearMap.get(dateStr);
    if (!dayStatus) {
      return;
    }

    result[dateStr] = dayStatus;
  });

  return result;
}

async function refreshCurrentAndNextYear() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const nextYear = thisYear + 1;

  for (const year of [thisYear, nextYear]) {
    try {
      await syncYear(year);
    } catch (error) {
      console.error(`[holiday-sync] refresh failed for ${year}:`, error.message);
    }
  }
}

async function initHolidaySync() {
  if (!config.holidaySyncEnabled) {
    return;
  }

  await ensureCacheDir();
  await refreshCurrentAndNextYear();

  const MAX_INTERVAL_MS = 2147483647; // 2^31 - 1, max safe setTimeout/setInterval delay
  const intervalMs = Math.min(Math.max(config.holidaySyncIntervalHours, 1) * 60 * 60 * 1000, MAX_INTERVAL_MS);
  if (!syncTimer) {
    syncTimer = setInterval(() => {
      refreshCurrentAndNextYear().catch((error) => {
        console.error('[holiday-sync] periodic refresh failed:', error.message);
      });
    }, intervalMs);
  }
}

module.exports = {
  ensureYearsReady,
  getHolidayMapByDates,
  getHolidayStatusMapByDates,
  initHolidaySync,
  refreshCurrentAndNextYear
};
