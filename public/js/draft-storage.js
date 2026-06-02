(function(window) {
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isEmptyObject(value) {
    return !value || Object.keys(value).length === 0;
  }

  function read(key) {
    if (!key || !window.localStorage) {
      return {};
    }

    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) {
        return {};
      }

      var parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function write(key, value) {
    if (!key || !window.localStorage) {
      return {};
    }

    try {
      if (!isPlainObject(value) || isEmptyObject(value)) {
        window.localStorage.removeItem(key);
        return {};
      }

      window.localStorage.setItem(key, JSON.stringify(value));
      return value;
    } catch (error) {
      return value;
    }
  }

  function patch(key, partial) {
    if (!isPlainObject(partial)) {
      return read(key);
    }

    var next = read(key);
    Object.keys(partial).forEach(function(field) {
      var value = partial[field];
      if (value === undefined || value === null || value === '') {
        delete next[field];
        return;
      }
      next[field] = value;
    });

    return write(key, next);
  }

  function clearFields(key, fields) {
    var next = read(key);
    if (!Array.isArray(fields)) {
      return write(key, next);
    }

    fields.forEach(function(field) {
      delete next[field];
    });

    return write(key, next);
  }

  window.DraftStorage = {
    get: read,
    patch: patch,
    clearFields: clearFields
  };
})(window);
