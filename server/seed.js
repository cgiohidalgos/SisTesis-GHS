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

  // Seed evaluadores reales (lista proporcionada por el cliente)
  const evaluadoresReales = [
    ['1107039618','RACUERVO@USBCALI.EDU.CO','RAUL ALBERTO CUERVO MULET','raul1107039618'],
    ['94371471','JFVALENC@USBCALI.EDU.CO','JOSE FERNANDO VALENCIA MURILLO','jose94371471'],
    ['1113693251','VVALDESE@USBCALI.EDU.CO','VALERIA VALDES ECHEVERRY','valeria1113693251'],
    ['1144085450','CVASQUEZ2@CORREO.USBCALI.EDU.CO','CAMILO VASQUEZ BUELVAS','camilo1144085450'],
    ['6200150','OCGARCIA@USBCALI.EDU.CO','OSCAR CASAS GARCIA','oscar6200150'],
    ['1143840848','YZULETAC@USBCALI.EDU.CO','YURANY ZULETA CAMAYO','yurany1143840848'],
    ['16932745','GADAVID@USBCALI.EDU.CO','GUILLERMO ADOLFO DAVID NUÑEZ','guillermo16932745'],
    ['1130646051','BFDIAZ@USBCALI.EDU.CO','BRAYAN FERNANDO DIAZ VALENCIA','brayan1130646051'],
    ['66999783','ESARRIA@USBCALI.EDU.CO','ERIKA SARRIA NAVARRO','erika66999783'],
    ['10742507','AFFERNANDEZA@USBCALI.EDU.CO','ANDRES FELIPE FERNANDEZ ARIAS','andres10742507'],
    ['76042397','EAGIRALD@USBCALI.EDU.CO','EDGAR ANTONIO GIRALDO OROZCO','edgar76042397'],
    ['94381315','PCGOMEZS@USBCALI.EDU.CO','PAULO CESAR GOMEZ SCHOUBEN','paulo94381315'],
    ['1151940289','CMPAREDESV@USBCALI.EDU.CO','CARLOS MARIO PAREDES VALENCIA','carlos1151940289'],
    ['6531328','AJRODRIGUEZV@USBCALI.EDU.CO','ANTONIO JOSE RODRIGUEZ VALENCIA','antonio6531328'],
    ['1085281803','CGHIDALGOS@USBCALI.EDU.CO','GIOVANNY HIDALGO SUAREZ','giovanny1085281803'],
    ['1086329137','LCBRAVOM@USBCALI.EDU.CO','LUIS CARLOS BRAVO MELO','luis1086329137'],
    ['16935321','CMBVARGA@USBCALI.EDU.CO','CARLOS MAURICIO BETANCUR VARGAS','carlos16935321'],
    ['16933345','JMESCOBARV@USBCALI.EDU.CO','JUAN MANUEL ESCOBAR VELASCO','juan16933345'],
    ['14465571','JUMAALQU@USBCALI.EDU.CO','JUAN MANUEL ALVAREZ QUINONES','juan14465571'],
    ['1107510397','KDMARIN@USBCALI.EDU.CO','KELLY DANIELLA MARÍN MONTEALEGRE','kelly1107510397'],
    ['94397484','JMFAJARDOC@USBCALI.EDU.CO','JUAN MANUEL FAJARDO CADENA','juan94397484'],
    ['1130666393','AMORENOB1@USBCALI.EDU.CO','ALEJANDRO MORENO BRAVO','alejandro1130666393'],
    ['27093852','DGSOLARTES@USBCALI.EDU.CO','DIANA GIZELLA SOLARTE SALOMON','diana27093852'],
    ['1130615519','FHPOSSO@USBCALI.EDU.CO','FABIÁN HUMBERTO POSSO GORDILLO','fabian1130615519'],
    ['1144065337','LGPOVEDA@USBCALI.EDU.CO','LUIS GABRIEL POVEDA PERDOMO','luis1144065337'],
    ['16929754','VMPENENO@USBCALI.EDU.CO','VICTOR MANUEL PEÑEÑORY BELTRAN','victor16929754'],
    ['1144073334','DPAREJA@USBCALI.EDU.CO','DANIEL PAREJA LONDOÑO','daniel1144073334'],
    ['41923075','CLZGUTIE@USBCALI.EDU.CO','CLAUDIA LILIANA ZULUAGA GUTIERREZ','claudia41923075'],
    ['1113650812','LFDELGADOM@USBCALI.EDU.CO','LUIS FERNANDO DELGADO MUÑOZ','luis1113650812'],
    ['93389613','MFACOSTA@USBCALI.EDU.CO','MARIO FERNANDO ACOSTA RIOS','mario93389613'],
    ['31573242','MHMORALESG@USBCALI.EDU.CO','MARIA HELENA MORALES GOMEZ','maria31573242'],
    ['16721737','GGPUERTA@USBCALI.EDU.CO','GUILLERMO GAMBOA PUERTA','guillermo16721737'],
    ['66957338','CAYORA@USBCALI.EDU.CO','CLAUDIA XIMENA AYORA PIEDRAHITA','claudia66957338'],
    ['1107035530','KCHAVARRIAGAL@USBCALI.EDU.CO','KATHERINE CHAVARRIAGA LENIS','katherine1107035530'],
    ['94413878','LHGARZONC@USBCALI.EDU.CO','LUIS HERNANDO GARZON CANIZALES','luis94413878'],
    ['34322957','DPNAVIA@USBCALI.EDU.CO','DIANA PAOLA NAVIA PORRAS','diana34322957'],
    ['94508520','JDELGADO1@USBCALI.EDU.CO','JOHANNES DELGADO OSPINA','johannes94508520'],
    ['1144165433','JESPARZAE@USBCALI.EDU.CO','JESSICA ESPARZA ESTRADA','jessica1144165433'],
    ['31574540','CXGLOPEZ@USBCALI.EDU.CO','CLAUDIA XIMENA GRAJALES LOPEZ','claudia31574540'],
    ['1113671179','COORD.ACADEMICOFD@USBCALI.EDU.CO','ANGELA MARIA LEAL MAGON','angela1113671179'],
    ['94459598','VTRUJILLO1@USBCALI.EDU.CO','VLADIMIR TRUJILLO OLAYA','vladimir94459598'],
    ['1144092038','PDAVALOSP@USBCALI.EDU.CO','PABLO DAVALOS PEREZ','pablo1144092038'],
    ['1144151665','EATORRES@USBCALI.EDU.CO','EDWIN ARLEX TORRES STUART','edwin1144151665'],
    ['94507357','ADESCOBA@USBCALI.EDU.CO','ALBERTO DAVID ESCOBAR SANDOVAL','alberto94507357'],
    ['94384094','IMCABEZAS@USBCALI.EDU.CO','IVAN MAURICIO CABEZAS TROYANO','ivan94384094'],
    ['34568825','BEGRASS@USBCALI.EDU.CO','BEATRIZ EUGENIA GRASS RAMIREZ','beatriz34568825'],
    ['1144128050','LJJARAMILLOC@USBCALI.EDU.CO','LEIDY JOHANNA JARAMILLO CAICEDO','leidy1144128050'],
    ['16459137','EMESIASL@USBCALI.EDU.CO','ELIECER MESIAS LOPEZ','eliecer16459137'],
    ['36753965','MFGRANDAR@USBCALI.EDU.CO','MARIA FERNANDA GRANDA ROMERO','maria36753965'],
    ['13921194','LMERCHAN@USBCALI.EDU.CO','LUIS MERCHAN PAREDES','luis13921194']
  ];

  for (const [cedula, email, fullName, password] of evaluadoresReales) {
    const existsByEmail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(email);
    const existsByCedula = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (existsByEmail || existsByCedula) {
      console.log(`🔁 Saltando evaluador existente (email/cedula): ${email} / ${cedula}`);
      continue;
    }

    const idEval = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(idEval, email, passwordHash, fullName, null, cedula, email);

    db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), idEval, 'evaluator', now);

    db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, institutional_email, cedula, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(idEval, fullName, email, cedula, now, now);

    console.log(`Created evaluator: ${fullName} (${email}), password: ${password}`);
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

    const cedula = `1000000${i + 1}`; // simple dummy cedula
    const existingEval = db.prepare('SELECT id FROM users WHERE institutional_email = ? OR cedula = ?').get(email, cedula);
    if (existingEval) {
      console.log(`🔁 Saltando evaluador existente (email/cedula): ${email} / ${cedula}`);
      continue;
    }

    const idEval = uuidv4();
    const password = `${fullName.split(' ')[0]}${cedula}`;
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      db.prepare('INSERT INTO users (id, email, password_hash, full_name, institutional_email, cedula) VALUES (?, ?, ?, ?, ?, ?)')
        .run(idEval, email, passwordHash, fullName, email, cedula);

      db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), idEval, 'evaluator', now);

      db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, institutional_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(idEval, fullName, email, now, now);

      console.log(`Created evaluator: ${fullName} (${email}), password: ${password}`);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        console.log(`⚠️ Skipped evaluator due to duplicate cedula/email: ${email} / ${cedula}`);
        continue;
      }
      throw err;
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

run().catch(err => {
  console.error(err);
  process.exit(1);
});
