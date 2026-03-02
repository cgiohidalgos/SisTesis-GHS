
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = new Database(path.join(__dirname, 'data', 'data.sqlite'));

// Todas las tablas deben crearse después de instanciar db
db.pragma('journal_mode = WAL');

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  full_name TEXT,
  student_code TEXT,
  cedula TEXT,
  institutional_email TEXT
)`).run();
// antes de crear índices únicos limpiamos posibles duplicados de ejecuciones anteriores
try {
  // para cada código repetido, dejamos uno y anulamos el resto
  const dupCodes = db.prepare(`SELECT student_code FROM users WHERE student_code IS NOT NULL GROUP BY student_code HAVING COUNT(*)>1`).all();
  for (const { student_code } of dupCodes) {
    const rows = db.prepare('SELECT id FROM users WHERE student_code = ? ORDER BY id').all(student_code);
    rows.slice(1).forEach(r => {
      db.prepare('UPDATE users SET student_code = NULL WHERE id = ?').run(r.id);
    });
  }
  const dupCedulas = db.prepare(`SELECT cedula FROM users WHERE cedula IS NOT NULL GROUP BY cedula HAVING COUNT(*)>1`).all();
  for (const { cedula } of dupCedulas) {
    const rows = db.prepare('SELECT id FROM users WHERE cedula = ? ORDER BY id').all(cedula);
    rows.slice(1).forEach(r => {
      db.prepare('UPDATE users SET cedula = NULL WHERE id = ?').run(r.id);
    });
  }
} catch (e) {
  console.warn('error cleaning duplicates', e);
}
// índices únicos para evitar duplicados de código y cédula
// SQLite permite múltiples NULLs, por lo que solo se aplicará cuando haya valor
db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_code ON users(student_code)`).run();
db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cedula ON users(cedula)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  student_code TEXT,
  cedula TEXT,
  institutional_email TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT,
  keywords TEXT,
  created_by TEXT,
  status TEXT DEFAULT 'draft',
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS thesis_students (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  student_id TEXT,
  FOREIGN KEY(thesis_id) REFERENCES theses(id),
  FOREIGN KEY(student_id) REFERENCES users(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS thesis_evaluators (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  evaluator_id TEXT,
  assigned_at INTEGER DEFAULT (strftime('%s','now')),
  due_date INTEGER,
  is_blind INTEGER DEFAULT 0,
  FOREIGN KEY(thesis_id) REFERENCES theses(id),
  FOREIGN KEY(evaluator_id) REFERENCES users(id)
)`).run();
// if the column didn't exist in older deployments, add it
try {
  db.prepare('ALTER TABLE thesis_evaluators ADD COLUMN due_date INTEGER').run();
  console.log('migration: added due_date column to thesis_evaluators');
} catch (e) {
  // ignore if already exists
}
// add keywords column to thesis table if missing
try {
  db.prepare('ALTER TABLE theses ADD COLUMN keywords TEXT').run();
  console.log('migration: added keywords column to theses');
} catch (e) {
  // ignore if already exists
}

// add defense scheduling columns one by one so a failure on one doesn't block others
try {
  db.prepare('ALTER TABLE theses ADD COLUMN defense_date INTEGER').run();
  console.log('migration: added defense_date column to theses');
} catch (e) {
  // ignore
}
try {
  db.prepare('ALTER TABLE theses ADD COLUMN defense_location TEXT').run();
  console.log('migration: added defense_location column to theses');
} catch (e) {
  // ignore
}
try {
  db.prepare('ALTER TABLE theses ADD COLUMN defense_info TEXT').run();
  console.log('migration: added defense_info column to theses');
} catch (e) {
  // ignore
}

db.prepare(`CREATE TABLE IF NOT EXISTS thesis_files (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  file_name TEXT,
  file_type TEXT,
  file_url TEXT,
  uploaded_at INTEGER DEFAULT (strftime('%s','now')),
  uploaded_by TEXT,
  FOREIGN KEY(thesis_id) REFERENCES theses(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS thesis_directors (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  name TEXT,
  FOREIGN KEY(thesis_id) REFERENCES theses(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS thesis_timeline (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  event_type TEXT,
  description TEXT,
  completed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(thesis_id) REFERENCES theses(id)
)`).run();

// categorias/programas para tesis
 db.prepare(`CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  admin_user_id TEXT,
  FOREIGN KEY(admin_user_id) REFERENCES users(id)
)`).run();
// add column to existing deployments if needed
try {
  db.prepare('ALTER TABLE programs ADD COLUMN admin_user_id TEXT').run();
  console.log('migration: added admin_user_id column to programs');
} catch (e) {
  // ignore if already exists
}

// new many-to-many relation for program administrators (supports multiple admins per program)
 db.prepare(`CREATE TABLE IF NOT EXISTS program_admins (
  id TEXT PRIMARY KEY,
  program_id TEXT,
  user_id TEXT,
  FOREIGN KEY(program_id) REFERENCES programs(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  UNIQUE(program_id, user_id)
)`).run();

// backfill existing single-admin column into join table if necessary
try {
  const rows = db.prepare('SELECT id, admin_user_id FROM programs WHERE admin_user_id IS NOT NULL').all();
  for (const { id, admin_user_id } of rows) {
    const exists = db.prepare('SELECT 1 FROM program_admins WHERE program_id = ? AND user_id = ?').get(id, admin_user_id);
    if (!exists) {
      db.prepare('INSERT INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
        .run(uuidv4(), id, admin_user_id);
    }
  }
  // optionally clear admin_user_id column? we can leave it for compatibility
  console.log('migration: backfilled program_admins from programs.admin_user_id');
} catch (e) {
  console.warn('migration program_admins backfill failed', e);
}

// relación varios-a-varios tesis<->programas
 db.prepare(`CREATE TABLE IF NOT EXISTS thesis_programs (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  program_id TEXT,
  FOREIGN KEY(thesis_id) REFERENCES theses(id),
  FOREIGN KEY(program_id) REFERENCES programs(id)
)`).run();

// items configurables para la lista de revisión de tesis (superadmin puede editarlos)
 db.prepare(`CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
)`).run();

// configuración general disponible para superadmin (pesos de evaluación, etc.)
 db.prepare(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`).run();

// defaults: 70% documento, 30% exposición
const existingDoc = db.prepare('SELECT value FROM settings WHERE key = ?').get('doc_weight');
if (!existingDoc) {
  db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run('doc_weight','70');
  db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run('presentation_weight','30');
}


// insert default items if table is empty (for upgrades)
try {
  const count = db.prepare('SELECT COUNT(*) as c FROM review_items').get().c;
  if (count === 0) {
    const defaults = ['Avala director(es)', 'Documento', 'Otros documentos'];
    for (let i = 0; i < defaults.length; i++) {
      db.prepare('INSERT INTO review_items (id, label, sort_order) VALUES (?, ?, ?)')
        .run(uuidv4(), defaults[i], i);
    }
    console.log('migration: seeded default review_items');
  }
} catch (e) {
  console.warn('failed migrating review_items defaults', e);
}

// make sure the column exists even on older databases
try {
  db.prepare("ALTER TABLE evaluations ADD COLUMN evaluation_type TEXT DEFAULT 'document'").run();
} catch (e) {
  // if the column already exists this will fail, ignore
}

db.prepare(`CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  thesis_evaluator_id TEXT,
  concept TEXT,
  evaluation_type TEXT DEFAULT 'document',
  created_at INTEGER DEFAULT (strftime('%s','now')),
  final_score INTEGER,
  general_observations TEXT,
  submitted_at INTEGER,
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(thesis_evaluator_id) REFERENCES thesis_evaluators(id)
)`).run();

// migrate existing rows: set evaluation_type='document' if null
try {
  db.prepare("UPDATE evaluations SET evaluation_type='document' WHERE evaluation_type IS NULL").run();
} catch(e) {
  // ignore if table empty or column absent
}

db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_scores (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT,
  section_id TEXT,
  criterion_id TEXT,
  score INTEGER,
  observations TEXT,
  FOREIGN KEY(evaluation_id) REFERENCES evaluations(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_files (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT,
  file_name TEXT,
  file_url TEXT,
  uploaded_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(evaluation_id) REFERENCES evaluations(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,
  event_type TEXT,
  label TEXT,
  description TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  attachments TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(thesis_id) REFERENCES theses(id)
)`).run();

module.exports = db;
