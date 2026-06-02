const db = require('./database');
const config = require('../config');

function runMigrations() {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create todos table
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      parent_id INTEGER,
      title TEXT NOT NULL CHECK(length(title) <= 500),
      priority INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS weather_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      request_count INTEGER NOT NULL DEFAULT 0,
      last_fetched_at TEXT,
      weather_text TEXT,
      weather_temp TEXT,
      weather_icon TEXT,
      weather_obs_time TEXT,
      weather_update_time TEXT,
      weather_location TEXT,
      weather_location_name TEXT,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const todoColumns = db.prepare('PRAGMA table_info(todos)').all();
  const hasParentId = todoColumns.some((column) => column.name === 'parent_id');
  const hasPriority = todoColumns.some((column) => column.name === 'priority');
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const hasUserColumn = (name) => userColumns.some((column) => column.name === name);

  const weatherColumns = db.prepare('PRAGMA table_info(weather_state)').all();
  const hasWeatherColumn = (name) => weatherColumns.some((column) => column.name === name);

  if (!hasParentId) {
    db.exec('ALTER TABLE todos ADD COLUMN parent_id INTEGER');
  }

  if (!hasPriority) {
    db.exec('ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0');
  }

  const hasProjectDuration = todoColumns.some((column) => column.name === 'project_duration');
  if (!hasProjectDuration) {
    db.exec('ALTER TABLE todos ADD COLUMN project_duration REAL DEFAULT 1.0');
  }

  const hasSortOrder = todoColumns.some((column) => column.name === 'sort_order');
  if (!hasSortOrder) {
    db.exec('ALTER TABLE todos ADD COLUMN sort_order INTEGER DEFAULT 0');
  }

  const hasStatus = todoColumns.some((column) => column.name === 'status');
  if (!hasStatus) {
    db.exec("ALTER TABLE todos ADD COLUMN status TEXT DEFAULT 'todo'");
    db.exec("UPDATE todos SET status = 'done' WHERE completed = 1");
    db.exec("UPDATE todos SET status = 'todo' WHERE completed = 0");
  }

  const hasInProgressAt = todoColumns.some((column) => column.name === 'in_progress_at');
  if (!hasInProgressAt) {
    db.exec('ALTER TABLE todos ADD COLUMN in_progress_at DATETIME');
  }

  const hasCompletedAt = todoColumns.some((column) => column.name === 'completed_at');
  if (!hasCompletedAt) {
    db.exec('ALTER TABLE todos ADD COLUMN completed_at DATETIME');
  }

  if (!hasUserColumn('notes_api_key_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN notes_api_key_hash TEXT');
  }

  if (!hasUserColumn('notes_api_key_prefix')) {
    db.exec('ALTER TABLE users ADD COLUMN notes_api_key_prefix TEXT');
  }

  if (!hasUserColumn('notes_api_key_created_at')) {
    db.exec('ALTER TABLE users ADD COLUMN notes_api_key_created_at DATETIME');
  }

  if (!hasUserColumn('notes_api_key_last_used_at')) {
    db.exec('ALTER TABLE users ADD COLUMN notes_api_key_last_used_at DATETIME');
  }

  db.exec(`
    UPDATE todos
    SET completed_at = COALESCE(completed_at, updated_at)
    WHERE completed_at IS NULL AND (status = 'done' OR completed = 1)
  `);

  if (!hasWeatherColumn('enabled')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!hasWeatherColumn('request_count')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN request_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasWeatherColumn('last_fetched_at')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN last_fetched_at TEXT');
  }
  if (!hasWeatherColumn('weather_text')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_text TEXT');
  }
  if (!hasWeatherColumn('weather_temp')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_temp TEXT');
  }
  if (!hasWeatherColumn('weather_icon')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_icon TEXT');
  }
  if (!hasWeatherColumn('weather_obs_time')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_obs_time TEXT');
  }
  if (!hasWeatherColumn('weather_update_time')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_update_time TEXT');
  }
  if (!hasWeatherColumn('weather_location')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_location TEXT');
  }
  if (!hasWeatherColumn('weather_location_name')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN weather_location_name TEXT');
  }
  if (!hasWeatherColumn('last_error')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN last_error TEXT');
  }
  if (!hasWeatherColumn('created_at')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN created_at DATETIME');
  }
  if (!hasWeatherColumn('updated_at')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN updated_at DATETIME');
  }
  if (!hasWeatherColumn('request_count_date')) {
    db.exec('ALTER TABLE weather_state ADD COLUMN request_count_date TEXT');
  }

  db.prepare(`
    INSERT OR IGNORE INTO weather_state (id, enabled, request_count)
    VALUES (1, 1, 0)
  `).run();

  db.exec(`
    UPDATE weather_state
    SET
      weather_location = COALESCE(weather_location, '${String(config.weatherLocation || '101010100').replace(/'/g, "''")}'),
      weather_location_name = COALESCE(
        weather_location_name,
        ${config.weatherLocationName ? `'${String(config.weatherLocationName).replace(/'/g, "''")}'` : 'weather_location'},
        weather_location,
        '${String(config.weatherLocation || '101010100').replace(/'/g, "''")}'
      ),
      created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
      updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
    WHERE id = 1
  `);

  // Create weather city history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS weather_city_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL UNIQUE,
      location_name TEXT NOT NULL,
      selected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todos_user_completed ON todos(user_id, completed)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todos_user_parent ON todos(user_id, parent_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todos_user_priority ON todos(user_id, parent_id, priority, completed, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status)
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_notes_api_key_hash
    ON users(notes_api_key_hash)
    WHERE notes_api_key_hash IS NOT NULL
  `);
}

if (require.main === module) {
  runMigrations();
  console.log('✓ Database migrations completed successfully');
  db.close();
}

module.exports = { runMigrations };
