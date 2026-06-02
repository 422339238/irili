require('dotenv').config();

const config = require('../config');
const db = require('./database');
const bcrypt = require('bcryptjs');

const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD must be set in environment variables or .env');
}

const hashedPassword = bcrypt.hashSync(adminPassword, 12);

db.prepare('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)')
  .run(config.adminUsername, hashedPassword);

console.log('✓ Database seeding completed successfully');

db.close();
