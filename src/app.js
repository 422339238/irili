const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const config = require('./config');
const SQLiteStore = require('connect-sqlite3')(session);
const { runMigrations } = require('./db/migrate');
const { initHolidaySync } = require('./services/holidayService');

function createApp(options = {}) {
  const {
    enableBackgroundServices = true,
    runDatabaseMigrations = true
  } = options;

  if (runDatabaseMigrations) {
    runMigrations();
  }

  if (enableBackgroundServices) {
    initHolidaySync().catch((error) => {
      console.error('[holiday-sync] init failed:', error.message);
    });
  }

  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layout');

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(session({
    store: new SQLiteStore({
      db: 'sessions.sqlite',
      dir: config.sessionDbDir
    }),
    secret: config.sessionSecret,
    name: 'todu.sid',
    rolling: config.sessionRolling,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.sessionCookieSecure,
      maxAge: config.sessionMaxAgeDays * 24 * 60 * 60 * 1000
    }
  }));

  const { addUserToLocals } = require('./middleware/auth');
  app.use(addUserToLocals);

  const authRoutes = require('./routes/auth');
  const todoRoutes = require('./routes/todos');
  const adminRoutes = require('./routes/admin');
  const kanbanRoutes = require('./routes/kanban');
  const noteRoutes = require('./routes/notes');
  const settingsRoutes = require('./routes/settings');
  const apiRoutes = require('./routes/api');

  app.use(authRoutes);
  app.use(apiRoutes);
  app.use(todoRoutes);
  app.use(adminRoutes);
  app.use(kanbanRoutes);
  app.use(noteRoutes);
  app.use(settingsRoutes);

  app.use((req, res) => {
    res.status(404).send('Page not found');
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong');
  });

  return app;
}

function startServer(app, options = {}) {
  const host = options.host || config.host;
  const port = options.port !== undefined ? options.port : config.port;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on('error', reject);
  });
}

if (require.main === module) {
  const app = createApp();
  startServer(app)
    .then((server) => {
      const address = server.address();
      const actualHost = address && typeof address === 'object' ? address.address : config.host;
      const actualPort = address && typeof address === 'object' ? address.port : config.port;
      console.log(`Todu server running on http://${actualHost}:${actualPort}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  createApp,
  startServer
};
