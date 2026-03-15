const db = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const adminName = process.env.ADMIN_NAME || 'Administrator';

  // seed some default programs
  const defaultPrograms = [
    'Ingeniería Biomédica',
    'Ingeniería Multimedia',
    'Ingeniería Industrial',
    'Ingeniería Agroindustrial',
    'Ingeniería Electrónica',
    'Ingeniería de Sistemas',
    'Ingeniería Biológica',
    'Especialización en Gestión de Procesos Productivos y de Servicios',
    'Especialización en Gestión Integral de Proyectos',
    'Especialización en Procesos de Desarrollo de Software',
    'Maestría en Gerencia de Proyectos',
    'Maestría en Tecnologías de la Información para la Analítica de Datos',
    'Doctorado en Ingeniería',
  ];

  const ensureProgramsExist = () => {
    try {
      const existing = db.prepare('SELECT name FROM programs').all().map(r => r.name);
      const missing = defaultPrograms.filter((name) => !existing.includes(name));
      if (missing.length > 0) {
        for (const name of missing) {
          db.prepare('INSERT INTO programs (id, name) VALUES (?, ?)').run(uuidv4(), name);
        }
        console.log('Seeded default programs:', missing.join(', '));
      }
    } catch (err) {
      // ignore if programs table not present yet
    }
  };

  ensureProgramsExist();

  const now = Math.floor(Date.now() / 1000);

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

    // optionally reset the admin password to the value from ADMIN_PASSWORD when running in local/dev
    if (process.env.ADMIN_PASSWORD_RESET === '1') {
      const password_hash = await bcrypt.hash(adminPassword, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, existing.id);
      console.log('Updated admin password from ADMIN_PASSWORD env');
    }

    // Continue to seed evaluators even if admin already exists
  }

  // If admin did not exist, create it now
  if (!existing) {
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

    console.log('Created admin user:');
    console.log('  institutional_email:', adminEmail);
    console.log('  password:', adminPassword);
    console.log('  id:', id);
  }

  // Seed simulated evaluators (10 users)
  const simulatedEvaluators = [
    'Carlos Giovanny Hidalgo Suarez',
    'María Fernanda López',
    'Luis Alberto Ramírez',
    'Ana Sofía Pérez',
    'Juan Diego Rodríguez',
    'Andrés Felipe Morales',
    'Natalia Jiménez García',
    'Sofía Camila Torres',
    'David Alejandro Castro',
    'Laura Valentina Herrera',
  ];

  for (let i = 0; i < simulatedEvaluators.length; i++) {
    const fullName = simulatedEvaluators[i];
    const email = `evaluador${i + 1}@usbcali.edu.co`;

    // skip if already exists
    const existingEval = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEval) continue;

    const idEval = uuidv4();
    const cedula = `1000000${i + 1}`; // simple dummy cedula
    const password = `${fullName.split(' ')[0]}${cedula}`;
    const passwordHash = await bcrypt.hash(password, 10);

    db.prepare('INSERT INTO users (id, email, password_hash, full_name, institutional_email, cedula) VALUES (?, ?, ?, ?, ?, ?)')
      .run(idEval, email, passwordHash, fullName, email, cedula);

    db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), idEval, 'evaluator', now);

    db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, institutional_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(idEval, fullName, email, now, now);

    console.log(`Created evaluator: ${fullName} (${email}), password: ${password}`);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
