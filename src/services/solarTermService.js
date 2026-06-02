const SOLAR_TERMS = [
  { name: '小寒', month: 1, c20: 6.11, c21: 5.4055 },
  { name: '大寒', month: 1, c20: 20.84, c21: 20.12 },
  { name: '立春', month: 2, c20: 4.6295, c21: 3.87 },
  { name: '雨水', month: 2, c20: 19.4599, c21: 18.73 },
  { name: '惊蛰', month: 3, c20: 6.3826, c21: 5.63 },
  { name: '春分', month: 3, c20: 21.4155, c21: 20.646 },
  { name: '清明', month: 4, c20: 4.84, c21: 4.81 },
  { name: '谷雨', month: 4, c20: 20.1, c21: 20.1 },
  { name: '立夏', month: 5, c20: 5.52, c21: 5.52 },
  { name: '小满', month: 5, c20: 21.04, c21: 21.04 },
  { name: '芒种', month: 6, c20: 5.678, c21: 5.678 },
  { name: '夏至', month: 6, c20: 21.37, c21: 21.37 },
  { name: '小暑', month: 7, c20: 7.108, c21: 7.108 },
  { name: '大暑', month: 7, c20: 22.83, c21: 22.83 },
  { name: '立秋', month: 8, c20: 7.5, c21: 7.5 },
  { name: '处暑', month: 8, c20: 23.13, c21: 23.13 },
  { name: '白露', month: 9, c20: 7.646, c21: 7.646 },
  { name: '秋分', month: 9, c20: 23.042, c21: 23.042 },
  { name: '寒露', month: 10, c20: 8.318, c21: 8.318 },
  { name: '霜降', month: 10, c20: 23.438, c21: 23.438 },
  { name: '立冬', month: 11, c20: 7.438, c21: 7.438 },
  { name: '小雪', month: 11, c20: 22.36, c21: 22.36 },
  { name: '大雪', month: 12, c20: 7.18, c21: 7.18 },
  { name: '冬至', month: 12, c20: 21.94, c21: 21.94 }
];

function pad2(value) {
  return String(value).padStart(2, '0');
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

function clampDay(year, month, day) {
  const maxDays = new Date(year, month, 0).getDate();
  return Math.min(Math.max(day, 1), maxDays);
}

function computeSolarTermDay(year, term) {
  const y = year % 100;
  const c = year >= 2000 ? term.c21 : term.c20;
  const leapAdjust = year >= 2000
    ? Math.floor(y / 4)
    : Math.floor((y - 1) / 4);

  const rawDay = Math.floor(y * 0.2422 + c) - leapAdjust;
  return clampDay(year, term.month, rawDay);
}

function buildYearSolarTermMap(year) {
  const map = {};

  SOLAR_TERMS.forEach((term) => {
    const day = computeSolarTermDay(year, term);
    const dateStr = `${year}-${pad2(term.month)}-${pad2(day)}`;
    map[dateStr] = term.name;
  });

  return map;
}

function getSolarTermMapByDates(dateList) {
  const validDates = Array.isArray(dateList) ? dateList.filter(isValidIsoDateString) : [];
  if (validDates.length === 0) {
    return {};
  }

  const years = [...new Set(validDates.map((dateStr) => parseInt(dateStr.slice(0, 4), 10)))];
  const byDate = {};

  years.forEach((year) => {
    Object.assign(byDate, buildYearSolarTermMap(year));
  });

  const result = {};
  validDates.forEach((dateStr) => {
    if (byDate[dateStr]) {
      result[dateStr] = byDate[dateStr];
    }
  });

  return result;
}

module.exports = {
  getSolarTermMapByDates
};
