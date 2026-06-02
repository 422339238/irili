const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = config.notesDataDir;

function getNotesDir(userId) {
  return path.join(DATA_DIR, String(userId));
}

function ensureDir(userId, year, month) {
  const dirPath = path.join(getNotesDir(userId), String(year), String(month).padStart(2, '0'));
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getFilePath(userId, dateStr) {
  const [year, month] = dateStr.split('-');
  return path.join(getNotesDir(userId), year, month, `${dateStr}.md`);
}

function isValidDateStr(dateStr) {
  return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function parseNoteFile(content) {
  if (!content || !content.trim()) {
    return [];
  }

  const entries = content.split(/\n---\n/).filter(s => s.trim());
  const notes = [];

  entries.forEach(entry => {
    const trimmed = entry.replace(/^---\n/, '').trim();
    if (!trimmed) return;

    const lines = trimmed.split('\n');
    const headerMatch = lines[0].trim().match(/^##\s+(\d{1,2}:\d{2})(?:\s+-\s+.+)?$/);
    if (headerMatch) {
      const time = headerMatch[1];
      const body = lines.slice(1).join('\n').trim();
      notes.push({ time, content: body, raw: trimmed });
    } else {
      notes.push({ time: '', content: trimmed, raw: trimmed });
    }
  });

  return notes;
}

function serializeNoteEntry(note) {
  const safeTime = note && note.time ? String(note.time).trim() : '';
  const safeContent = note && note.content ? String(note.content).trim() : '';

  if (safeTime) {
    let entry = `## ${safeTime}`;
    if (safeContent) {
      entry += '\n\n' + safeContent;
    }
    return entry;
  }

  return safeContent;
}

function serializeNotes(notes) {
  return notes
    .map(serializeNoteEntry)
    .filter(entry => entry && entry.trim())
    .join('\n\n---\n');
}

function normalizeNoteFileContent(content) {
  const notes = parseNoteFile(content);
  return serializeNotes(notes);
}

function getNotesForDate(userId, dateStr) {
  if (!isValidDateStr(dateStr)) return [];

  const filePath = getFilePath(userId, dateStr);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const notes = parseNoteFile(content);
    const normalized = normalizeNoteFileContent(content);
    const current = String(content || '').trim();

    if (normalized && normalized !== current) {
      fs.writeFileSync(filePath, normalized + '\n', 'utf-8');
    }

    return notes;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function getNoteFileUpdatedAt(userId, dateStr) {
  if (!isValidDateStr(dateStr)) return null;

  const filePath = getFilePath(userId, dateStr);
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function getNoteDatesForMonth(userId, yearMonth) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return [];

  const [year, month] = yearMonth.split('-');
  const dirPath = path.join(getNotesDir(userId), year, month);

  try {
    const files = fs.readdirSync(dirPath);
    return files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace('.md', ''))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function appendNote(userId, dateStr, content, clientTime) {
  if (!isValidDateStr(dateStr)) return;

  const [year, month] = dateStr.split('-');
  ensureDir(userId, year, month);
  const filePath = getFilePath(userId, dateStr);

  let timeStr;
  if (clientTime && /^\d{1,2}:\d{2}$/.test(clientTime.trim())) {
    timeStr = clientTime.trim();
  } else {
    const now = new Date();
    timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }
  const safeContent = (content || '').trim();

  const entry = serializeNoteEntry({ time: timeStr, content: safeContent });

  let existing = '';
  try {
    existing = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (existing.trim()) {
    fs.writeFileSync(filePath, existing.trimEnd() + '\n\n---\n' + entry + '\n', 'utf-8');
  } else {
    fs.writeFileSync(filePath, entry + '\n', 'utf-8');
  }
}

function updateNoteEntry(userId, dateStr, noteIndex, content) {
  if (!isValidDateStr(dateStr)) return;

  const filePath = getFilePath(userId, dateStr);
  let fileContent;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  const notes = parseNoteFile(fileContent);
  const idx = parseInt(noteIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= notes.length) return;

  const trimmedContent = (content || '').trim();
  if (!trimmedContent) return;

  notes[idx] = {
    ...notes[idx],
    content: trimmedContent,
    raw: serializeNoteEntry({
      time: notes[idx].time,
      content: trimmedContent
    })
  };

  const rebuilt = serializeNotes(notes);
  if (!rebuilt) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    return;
  }

  fs.writeFileSync(filePath, rebuilt + '\n', 'utf-8');
}

function deleteNote(userId, dateStr, noteIndex) {
  if (!isValidDateStr(dateStr)) return;

  const filePath = getFilePath(userId, dateStr);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  const notes = parseNoteFile(content);
  const idx = parseInt(noteIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= notes.length) return;

  notes.splice(idx, 1);

  if (notes.length === 0) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    return;
  }

  const rebuilt = serializeNotes(notes);
  fs.writeFileSync(filePath, rebuilt + '\n', 'utf-8');
}

function getMonthNoteSummary(userId, yearMonth) {
  const dates = getNoteDatesForMonth(userId, yearMonth);
  const summary = {};
  dates.forEach(d => {
    const notes = getNotesForDate(userId, d);
    if (notes.length > 0) {
      summary[d] = notes.length;
    }
  });
  return summary;
}

function getAllNoteDates(userId) {
  const userDir = getNotesDir(userId);
  const dates = [];
  try {
    const years = fs.readdirSync(userDir).filter(f => /^\d{4}$/.test(f));
    for (const year of years) {
      const yearDir = path.join(userDir, year);
      let months;
      try { months = fs.readdirSync(yearDir).filter(f => /^\d{2}$/.test(f)); } catch (e) { continue; }
      for (const month of months) {
        const monthDir = path.join(yearDir, month);
        let files;
        try { files = fs.readdirSync(monthDir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)); } catch (e) { continue; }
        files.forEach(f => dates.push(f.replace('.md', '')));
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return dates.sort();
}

function buildRecordedAt(dateStr, time) {
  const safeDate = String(dateStr || '').trim();
  const safeTime = String(time || '').trim();

  if (!isValidDateStr(safeDate) || !/^\d{1,2}:\d{2}$/.test(safeTime)) {
    return null;
  }

  const normalizedHour = safeTime.split(':')[0].padStart(2, '0');
  const normalizedMinute = safeTime.split(':')[1];
  return `${safeDate}T${normalizedHour}:${normalizedMinute}:00`;
}

function buildCombinedText(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const safeContent = entry && entry.content ? String(entry.content).trim() : '';
      const safeTime = entry && entry.time ? String(entry.time).trim() : '';
      if (!safeContent) {
        return safeTime ? `[${safeTime}]` : '';
      }
      return safeTime ? `[${safeTime}] ${safeContent}` : safeContent;
    })
    .filter(Boolean)
    .join('\n\n');
}

function getNoteDay(userId, dateStr) {
  const entries = getNotesForDate(userId, dateStr).map((entry, index) => ({
    index,
    time: entry && entry.time ? entry.time : '',
    recordedAt: buildRecordedAt(dateStr, entry && entry.time ? entry.time : ''),
    content: entry && entry.content ? entry.content : ''
  }));

  return {
    date: dateStr,
    updatedAt: getNoteFileUpdatedAt(userId, dateStr),
    entryCount: entries.length,
    combinedText: buildCombinedText(entries),
    entries
  };
}

function getPaginatedNoteDays(userId, page = 1, pageSize = 20) {
  const safePageSize = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 20));
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const allDates = getAllNoteDates(userId).sort((a, b) => b.localeCompare(a));
  const totalItems = allDates.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const sliceStart = (currentPage - 1) * safePageSize;
  const dates = allDates.slice(sliceStart, sliceStart + safePageSize);

  return {
    items: dates.map((dateStr) => getNoteDay(userId, dateStr)),
    page: currentPage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    hasMore: currentPage < totalPages
  };
}

module.exports = {
  getNotesDir,
  ensureDir,
  getFilePath,
  parseNoteFile,
  getNotesForDate,
  getNoteFileUpdatedAt,
  getNoteDatesForMonth,
  getAllNoteDates,
  appendNote,
  updateNoteEntry,
  deleteNote,
  getMonthNoteSummary,
  getNoteDay,
  getPaginatedNoteDays
};
