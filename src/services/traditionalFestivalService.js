const TRADITIONAL_FESTIVAL_BY_LUNAR = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
  '12-23': '小年',
  '12-24': '小年'
};

let LUNAR_FORMATTER = null;
try {
  LUNAR_FORMATTER = new Intl.DateTimeFormat('zh-Hans-CN-u-ca-chinese', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Shanghai'
  });
} catch (error) {
  LUNAR_FORMATTER = null;
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

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseLunarMonthDay(dateStr) {
  if (!LUNAR_FORMATTER) {
    return null;
  }

  const date = new Date(`${dateStr}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = LUNAR_FORMATTER.formatToParts(date);
  const monthPart = parts.find((part) => part.type === 'month');
  const dayPart = parts.find((part) => part.type === 'day');

  if (!monthPart || !dayPart) {
    return null;
  }

  const rawMonth = String(monthPart.value || '').trim();
  const isLeapMonth = rawMonth.startsWith('闰');
  const monthNumber = parseInt(rawMonth.replace(/[^\d]/g, ''), 10);
  const dayNumber = parseInt(String(dayPart.value || '').replace(/[^\d]/g, ''), 10);

  if (!Number.isInteger(monthNumber) || !Number.isInteger(dayNumber)) {
    return null;
  }

  return {
    month: monthNumber,
    day: dayNumber,
    isLeapMonth
  };
}

function appendFestival(result, dateStr, festivalName) {
  if (!festivalName) {
    return;
  }

  if (result[dateStr]) {
    if (!result[dateStr].includes(festivalName)) {
      result[dateStr] = `${result[dateStr]}·${festivalName}`;
    }
    return;
  }

  result[dateStr] = festivalName;
}

function getTraditionalFestivalMapByDates(dateList) {
  const validDates = Array.isArray(dateList) ? dateList.filter(isValidIsoDateString) : [];
  if (validDates.length === 0) {
    return {};
  }

  const uniqueDates = [...new Set(validDates)];
  const lunarByDate = {};
  const result = {};

  uniqueDates.forEach((dateStr) => {
    const lunar = parseLunarMonthDay(dateStr);
    if (!lunar) {
      return;
    }

    lunarByDate[dateStr] = lunar;

    if (!lunar.isLeapMonth) {
      const key = `${lunar.month}-${lunar.day}`;
      appendFestival(result, dateStr, TRADITIONAL_FESTIVAL_BY_LUNAR[key] || '');
    }
  });

  // 除夕：农历十二月最后一天（次日为正月初一）
  uniqueDates.forEach((dateStr) => {
    const current = lunarByDate[dateStr];
    if (!current || current.isLeapMonth || current.month !== 12) {
      return;
    }

    const nextDate = addDays(dateStr, 1);
    const nextLunar = parseLunarMonthDay(nextDate);
    if (nextLunar && !nextLunar.isLeapMonth && nextLunar.month === 1 && nextLunar.day === 1) {
      appendFestival(result, dateStr, '除夕');
    }
  });

  return result;
}

module.exports = {
  getTraditionalFestivalMapByDates
};
