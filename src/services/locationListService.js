const fs = require('fs/promises');
const path = require('path');
const config = require('../config');

const DEFAULT_LIMIT = 20;
const CACHE_FILE_NAME = 'China-City-List-latest.csv';

let locationCache = null;
let loadPromise = null;

function cacheFilePath() {
  return path.join(config.weatherLocationListCacheDir, CACHE_FILE_NAME);
}

function getMaxAgeMs() {
  return Math.max(config.weatherLocationListRefreshHours, 1) * 60 * 60 * 1000;
}

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      fields.push(value);
      value = '';
      continue;
    }

    value += ch;
  }

  fields.push(value);
  return fields.map((item) => String(item || '').trim());
}

function parseChinaCityCsv(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => line.startsWith('Location_ID,'));
  if (headerIndex < 0) {
    throw new Error('城市列表格式无效：缺少表头');
  }

  const records = [];
  const seenIds = new Set();
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const id = fields[0];

    if (!/^\d+$/.test(id)) {
      continue;
    }
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);

    records.push({
      id,
      nameEn: fields[1] || '',
      nameZh: fields[2] || '',
      countryZh: fields[5] || '',
      adm1Zh: fields[7] || '',
      adm2Zh: fields[9] || '',
      lat: fields[11] || '',
      lon: fields[12] || ''
    });
  }

  return records;
}

function toLocationLabel(record) {
  const parts = [];

  if (record.adm1Zh) {
    parts.push(record.adm1Zh);
  }
  if (record.adm2Zh && record.adm2Zh !== record.adm1Zh) {
    parts.push(record.adm2Zh);
  }
  if (record.nameZh && record.nameZh !== record.adm2Zh) {
    parts.push(record.nameZh);
  }

  const title = parts.length > 0
    ? parts.join(' / ')
    : (record.nameZh || record.nameEn || record.id);

  return `${title} (${record.id})`;
}

function toClientLocation(record) {
  return {
    id: record.id,
    nameZh: record.nameZh,
    nameEn: record.nameEn,
    adm1Zh: record.adm1Zh,
    adm2Zh: record.adm2Zh,
    label: toLocationLabel(record)
  };
}

async function ensureCacheDir() {
  await fs.mkdir(config.weatherLocationListCacheDir, { recursive: true });
}

async function readLocalCache() {
  try {
    const file = cacheFilePath();
    const [content, stat] = await Promise.all([
      fs.readFile(file, 'utf8'),
      fs.stat(file)
    ]);
    return {
      content,
      mtimeMs: stat.mtimeMs
    };
  } catch (error) {
    return null;
  }
}

async function writeLocalCache(content) {
  await ensureCacheDir();
  await fs.writeFile(cacheFilePath(), content, 'utf8');
}

async function fetchRemoteCsv() {
  if (!config.weatherLocationListUrl) {
    throw new Error('WEATHER_LOCATION_LIST_URL must be configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.weatherLocationListRequestTimeoutMs);

  try {
    const response = await fetch(config.weatherLocationListUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/csv'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadLocationDataset(forceRefresh = false) {
  const maxAgeMs = getMaxAgeMs();
  if (!forceRefresh && locationCache && Date.now() - locationCache.loadedAt < maxAgeMs) {
    return locationCache;
  }

  if (!forceRefresh && loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const local = await readLocalCache();
    const localFresh = Boolean(local && Date.now() - local.mtimeMs < maxAgeMs);
    let csvContent = localFresh && !forceRefresh ? local.content : null;

    if (!csvContent) {
      try {
        csvContent = await fetchRemoteCsv();
        await writeLocalCache(csvContent);
      } catch (error) {
        if (local && local.content) {
          csvContent = local.content;
        } else {
          throw error;
        }
      }
    }

    const records = parseChinaCityCsv(csvContent);
    const byId = new Map(records.map((record) => [record.id, record]));
    locationCache = {
      loadedAt: Date.now(),
      records,
      byId
    };
    return locationCache;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), 50);
}

function calcSearchScore(record, keyword) {
  const q = keyword.toLowerCase();
  const id = record.id.toLowerCase();
  const nameZh = (record.nameZh || '').toLowerCase();
  const nameEn = (record.nameEn || '').toLowerCase();
  const adm1Zh = (record.adm1Zh || '').toLowerCase();
  const adm2Zh = (record.adm2Zh || '').toLowerCase();

  if (id === q) return 120;
  if (nameZh === q || nameEn === q) return 110;
  if (id.startsWith(q)) return 100;
  if (nameZh.startsWith(q) || nameEn.startsWith(q)) return 90;
  if (nameZh.includes(q) || nameEn.includes(q)) return 80;
  if (adm1Zh.includes(q) || adm2Zh.includes(q)) return 70;
  return 0;
}

async function searchChinaCities(keyword, limit = DEFAULT_LIMIT) {
  const safeLimit = normalizeLimit(limit);
  const q = String(keyword || '').trim();
  const dataset = await loadLocationDataset();

  if (!q) {
    return dataset.records.slice(0, safeLimit).map(toClientLocation);
  }

  const scored = [];
  for (const record of dataset.records) {
    const score = calcSearchScore(record, q);
    if (score <= 0) {
      continue;
    }
    scored.push({ score, record });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.record.id.localeCompare(b.record.id);
  });

  return scored.slice(0, safeLimit).map((item) => toClientLocation(item.record));
}

async function getChinaCityById(locationId) {
  const id = String(locationId || '').trim();
  if (!id) {
    return null;
  }

  const dataset = await loadLocationDataset();
  const record = dataset.byId.get(id);
  return record ? toClientLocation(record) : null;
}

module.exports = {
  getChinaCityById,
  searchChinaCities
};
