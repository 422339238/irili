const {
  findUserByNotesApiKey,
  touchNotesApiKeyLastUsed
} = require('../services/notesApiKeyService');

function getApiKeyFromRequest(req) {
  const authHeader = req.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]) {
    return bearerMatch[1].trim();
  }

  const headerKey = req.get('x-api-key');
  if (headerKey) {
    return String(headerKey).trim();
  }

  return '';
}

function requireNotesApiKey(req, res, next) {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    res.set('WWW-Authenticate', 'Bearer realm="notes-api"');
    return res.status(401).json({
      error: 'Missing API key'
    });
  }

  const user = findUserByNotesApiKey(apiKey);
  if (!user) {
    res.set('WWW-Authenticate', 'Bearer realm="notes-api"');
    return res.status(401).json({
      error: 'Invalid API key'
    });
  }

  touchNotesApiKeyLastUsed(user.id);
  req.apiUser = {
    id: user.id,
    username: user.username,
    keyPrefix: user.keyPrefix
  };
  next();
}

module.exports = {
  requireNotesApiKey
};
