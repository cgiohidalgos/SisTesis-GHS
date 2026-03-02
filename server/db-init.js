const db = require('./db');

// Inicializa todas las tablas necesarias
function initSchema() {
  db.pragma('journal_mode = WAL');

  db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      full_name TEXT,
      student_code TEXT,
      cedula TEXT,
      institutional_email TEXT
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      student_code TEXT,
      cedula TEXT,
      institutional_email TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      created_at INTEGER
    )`
  ).run();

  // Agrega aquí otras tablas necesarias
}

initSchema();
console.log('DB schema initialized');
