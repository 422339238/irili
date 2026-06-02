const crypto = require('crypto');
const db = require('../db/database');

const API_KEY_PREFIX = 'rili_npk_';
const PREFIX_LENGTH = 16;

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || ''), 'utf8').digest('hex');
}

function buildPlaintextApiKey() {
  return API_KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

function buildKeyPrefix(apiKey) {
  return String(apiKey || '').slice(0, PREFIX_LENGTH);
}

function getNotesApiKeyMeta(userId) {
  return db.prepare(`
    SELECT
      notes_api_key_prefix AS keyPrefix,
      notes_api_key_created_at AS createdAt,
      notes_api_key_last_used_at AS lastUsedAt
    FROM users
    WHERE id = ?
  `).get(userId) || null;
}

function resetNotesApiKey(userId) {
  const apiKey = buildPlaintextApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyPrefix = buildKeyPrefix(apiKey);

  db.prepare(`
    UPDATE users
    SET
      notes_api_key_hash = ?,
      notes_api_key_prefix = ?,
      notes_api_key_created_at = CURRENT_TIMESTAMP,
      notes_api_key_last_used_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(keyHash, keyPrefix, userId);

  return {
    apiKey,
    meta: getNotesApiKeyMeta(userId)
  };
}

function findUserByNotesApiKey(apiKey) {
  const trimmedKey = String(apiKey || '').trim();
  if (!trimmedKey) {
    return null;
  }

  return db.prepare(`
    SELECT id, username, notes_api_key_prefix AS keyPrefix
    FROM users
    WHERE notes_api_key_hash = ?
  `).get(hashApiKey(trimmedKey)) || null;
}

function touchNotesApiKeyLastUsed(userId) {
  db.prepare(`
    UPDATE users
    SET
      notes_api_key_last_used_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);
}

module.exports = {
  getNotesApiKeyMeta,
  resetNotesApiKey,
  findUserByNotesApiKey,
  touchNotesApiKeyLastUsed
};
