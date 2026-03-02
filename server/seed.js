const db = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const adminName = process.env.ADMIN_NAME || 'Administrator';

  // seed some programs regardless of admin presence
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM programs').get().c;
    if (count === 0) {
      const defaultPrograms = [
        'Ingeniería de Sistemas',
        'Ingeniería Multimedia',
        'Ingeniería Electrónica',
        'Ingeniería Industrial'
      ];
      for (const name of defaultPrograms) {
        db.prepare('INSERT INTO programs (id, name) VALUES (?, ?)').run(uuidv4(), name);
      }
      console.log('Seeded default programs');
    }
  } catch (err) {
    // ignore if programs table not present yet
  }

  // check existing admin
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (existing) {
    console.log('Admin already exists with id', existing.id);
    // make sure they have superadmin role as well
    const hasSuper = db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?').get(existing.id, 'superadmin');
    if (!hasSuper) {
      db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), existing.id, 'superadmin', Math.floor(Date.now()/1000));
      console.log('Granted superadmin role to existing admin');
    }
    process.exit(0);
  }

  const id = uuidv4();
  const password_hash = await bcrypt.hash(adminPassword, 10);

  db.prepare('INSERT INTO users (id, email, password_hash, full_name, institutional_email) VALUES (?, ?, ?, ?, ?)')
    .run(id, adminEmail, password_hash, adminName, adminEmail);

  // create profile
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, student_code, cedula, institutional_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, adminName, null, null, adminEmail, now, now);

  // insert roles (admin + superadmin)
  const roleId = uuidv4();
  db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
    .run(roleId, id, 'admin', now);
  const superRoleId = uuidv4();
  db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
    .run(superRoleId, id, 'superadmin', now);

  // seed some programs if table exists and empty
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM programs').get().c;
    if (count === 0) {
      const defaultPrograms = [
        'Ingeniería de Sistemas',
        'Ingeniería Multimedia',
        'Ingeniería Electrónica',
        'Ingeniería Industrial'
      ];
      for (const name of defaultPrograms) {
        db.prepare('INSERT INTO programs (id, name) VALUES (?, ?)').run(uuidv4(), name);
      }
      console.log('Seeded default programs');
    }
  } catch (err) {
    // ignore if programs table not present yet
  }

  console.log('Created admin user:');
  console.log('  institutional_email:', adminEmail);
  console.log('  password:', adminPassword);
  console.log('  id:', id);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
