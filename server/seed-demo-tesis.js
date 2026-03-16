const db = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PROGRAM_ID = '5d59ab75-68c2-429f-85e2-39b2c43f5ab3'; // Ingeniería de Sistemas
const ADMIN_ID   = '45dca850-1a3a-44ef-9dfa-ad9511e34f23';
const EVAL1_ID   = '4da80865-d7a2-4a29-8f83-865b53549ca9'; // ALBERTO ESCOBAR
const EVAL2_ID   = 'bdd018fc-cac4-4d6d-a0ce-1a0245162384'; // ANDRES FERNANDEZ (será reemplazado)
const EVAL3_ID   = '31b78ec9-109c-411d-949c-309ca335bdc6'; // ALEJANDRO MORENO (reemplazo)

async function run() {
  db.pragma('foreign_keys = OFF');
  const now = Math.floor(Date.now() / 1000);
  const hash = await bcrypt.hash('test1234', 10);

  // ─── 1. Estudiantes ───────────────────────────────────────────────────────
  const s1id = uuidv4();
  db.prepare("INSERT OR IGNORE INTO users (id,email,password_hash,full_name,student_code,cedula,institutional_email) VALUES (?,?,?,?,?,?,?)")
    .run(s1id,'JDMARTINEZ@USBCALI.EDU.CO',hash,'JUAN DAVID MARTINEZ LOPEZ','2020134001','1098001001','JDMARTINEZ@USBCALI.EDU.CO');
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id,role) VALUES (?,?)").run(s1id,'student');

  const s2id = uuidv4();
  db.prepare("INSERT OR IGNORE INTO users (id,email,password_hash,full_name,student_code,cedula,institutional_email) VALUES (?,?,?,?,?,?,?)")
    .run(s2id,'ACGOMEZ@USBCALI.EDU.CO',hash,'ANA CATALINA GOMEZ RESTREPO','2020134002','1098001002','ACGOMEZ@USBCALI.EDU.CO');
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id,role) VALUES (?,?)").run(s2id,'student');

  console.log('✅ Estudiantes:', s1id, '/', s2id);

  // ─── 2. Tesis ─────────────────────────────────────────────────────────────
  const thesisId = uuidv4();
  db.prepare(`INSERT INTO theses (id,title,abstract,keywords,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(thesisId,
      'Sistema de Gestión Inteligente de Inventarios con IA para PYMES',
      'Este proyecto propone el desarrollo de un sistema de gestión de inventarios basado en inteligencia artificial para pequeñas y medianas empresas, optimizando procesos de abastecimiento mediante modelos predictivos de demanda.',
      'inteligencia artificial, inventarios, PYMES, machine learning',
      'defense_scheduled', now, now);

  db.prepare("INSERT INTO thesis_students (thesis_id,student_id) VALUES (?,?)").run(thesisId, s1id);
  db.prepare("INSERT INTO thesis_students (thesis_id,student_id) VALUES (?,?)").run(thesisId, s2id);
  db.prepare("INSERT INTO thesis_programs (thesis_id,program_id) VALUES (?,?)").run(thesisId, PROGRAM_ID);

  const dirUser = db.prepare("SELECT id FROM users WHERE institutional_email='CGHIDALGOS@USBCALI.EDU.CO'").get();
  const dirId = uuidv4();
  db.prepare("INSERT INTO thesis_directors (id,thesis_id,name,user_id) VALUES (?,?,?,?)")
    .run(dirId, thesisId, 'GIOVANNY HIDALGO SUAREZ', dirUser ? dirUser.id : null);

  console.log('✅ Tesis:', thesisId);

  // ─── 3. Timeline completo ─────────────────────────────────────────────────
  const t0 = now - 15 * 86400; // 15 días atrás
  const evs = [
    [t0,             'submitted',           'Tesis enviada a revisión por los estudiantes'],
    [t0 + 86400,     'file_uploaded',       'Archivo subido: propuesta_tesis_v1.pdf'],
    [t0 + 2*86400,   'review_fail',         'Admin devolvió con observaciones: Ampliar marco teórico y corregir referencias APA.'],
    [t0 + 4*86400,   'file_uploaded',       'Archivo subido: propuesta_tesis_v2_corregida.pdf'],
    [t0 + 4*86400,   'revision_submitted',  'Estudiante envió revisión (ronda 1): Se amplió el marco teórico y se corrigieron las referencias bibliográficas.'],
    [t0 + 5*86400,   'review_ok',           'Revisión aprobada — tesis enviada a evaluación de documento'],
    [t0 + 5*86400,   'evaluators_assigned', 'Evaluadores asignados: ALBERTO DAVID ESCOBAR SANDOVAL, ANDRES FELIPE FERNANDEZ ARIAS'],
    [t0 + 6*86400,   'evaluation_submitted','Evaluación de documento enviada por ALBERTO DAVID ESCOBAR SANDOVAL (con archivo adjunto)'],
    [t0 + 6.5*86400, 'evaluator_replaced',  'Evaluador reemplazado: ANDRES FELIPE FERNANDEZ ARIAS → ALEJANDRO MORENO BRAVO'],
    [t0 + 7*86400,   'evaluation_submitted','Evaluación de documento enviada por ALEJANDRO MORENO BRAVO'],
    [t0 + 8*86400,   'defense_scheduled',   'Sustentación programada: Sala de Juntas A-301, Edificio Ingeniería — ' + new Date((now + 7*86400)*1000).toLocaleDateString('es-CO')],
    [t0 + 14*86400,  'evaluation_submitted','Evaluación de sustentación enviada por ALBERTO DAVID ESCOBAR SANDOVAL'],
    [t0 + 14*86400,  'evaluation_submitted','Evaluación de sustentación enviada por ALEJANDRO MORENO BRAVO'],
  ];
  for (const [ts, type, desc] of evs) {
    db.prepare("INSERT INTO thesis_timeline (id,thesis_id,event_type,description,completed,created_at) VALUES (?,?,?,?,?,?)")
      .run(uuidv4(), thesisId, type, desc, 1, Math.floor(ts));
  }
  console.log('✅ Timeline creado con', evs.length, 'eventos');

  // ─── 4. Archivos ──────────────────────────────────────────────────────────
  const e1 = uuidv4(), e2 = uuidv4();
  db.prepare("INSERT INTO thesis_files (id,thesis_id,file_name,file_type,file_url,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?)")
    .run(uuidv4(), thesisId, 'propuesta_tesis_v1.pdf', 'document', '/uploads/propuesta_tesis_v1.pdf', s1id, Math.floor(t0+86400));
  db.prepare("INSERT INTO thesis_files (id,thesis_id,file_name,file_type,file_url,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?)")
    .run(uuidv4(), thesisId, 'propuesta_tesis_v2_corregida.pdf', 'document', '/uploads/propuesta_tesis_v2_corregida.pdf', s1id, Math.floor(t0+4*86400));
  console.log('✅ Archivos registrados');

  // ─── 5. Evaluadores y evaluaciones ────────────────────────────────────────
  const due = Math.floor(t0 + 20*86400);
  const te1id = uuidv4();
  const te3id = uuidv4();

  db.prepare("INSERT INTO thesis_evaluators (id,thesis_id,evaluator_id,is_blind,due_date,assigned_at) VALUES (?,?,?,?,?,?)")
    .run(te1id, thesisId, EVAL1_ID, 0, due, Math.floor(t0+5*86400));
  db.prepare("INSERT INTO thesis_evaluators (id,thesis_id,evaluator_id,is_blind,due_date,assigned_at) VALUES (?,?,?,?,?,?)")
    .run(te3id, thesisId, EVAL3_ID, 0, due, Math.floor(t0+6.5*86400));

  // Eval doc ALBERTO
  const ed1 = uuidv4();
  db.prepare("INSERT INTO evaluations (id,thesis_evaluator_id,evaluation_type,general_observations,submitted_at,created_at) VALUES (?,?,?,?,?,?)")
    .run(ed1, te1id, 'document',
      'El documento presenta una propuesta sólida con buena fundamentación teórica. Se recomienda profundizar en la sección de resultados esperados y añadir casos de uso concretos para las PYMES objetivo. La metodología es adecuada aunque podría reforzarse con referencias más recientes.',
      Math.floor(t0+6*86400), Math.floor(t0+6*86400));
  db.prepare("INSERT INTO evaluation_files (id,evaluation_id,file_name,file_url,uploaded_at) VALUES (?,?,?,?,?)")
    .run(uuidv4(), ed1, 'informe_eval_doc_escobar.pdf', '/uploads/informe_eval_doc_escobar.pdf', Math.floor(t0+6*86400));

  // Eval doc ALEJANDRO
  const ed2 = uuidv4();
  db.prepare("INSERT INTO evaluations (id,thesis_evaluator_id,evaluation_type,general_observations,submitted_at,created_at) VALUES (?,?,?,?,?,?)")
    .run(ed2, te3id, 'document',
      'La propuesta demuestra conocimiento adecuado del problema. Sugiero incorporar análisis de riesgos y especificar mejor los indicadores de éxito del sistema. El análisis de la competencia es pertinente.',
      Math.floor(t0+7*86400), Math.floor(t0+7*86400));

  // Eval oral ALBERTO
  db.prepare("INSERT INTO evaluations (id,thesis_evaluator_id,evaluation_type,general_observations,submitted_at,created_at) VALUES (?,?,?,?,?,?)")
    .run(uuidv4(), te1id, 'oral',
      'Excelente presentación. Los estudiantes demostraron dominio del tema y respondieron acertadamente todas las preguntas del jurado. La demo del sistema fue convincente y funcional.',
      Math.floor(t0+14*86400), Math.floor(t0+14*86400));

  // Eval oral ALEJANDRO
  db.prepare("INSERT INTO evaluations (id,thesis_evaluator_id,evaluation_type,general_observations,submitted_at,created_at) VALUES (?,?,?,?,?,?)")
    .run(uuidv4(), te3id, 'oral',
      'Buena presentación con claridad en objetivos. Se recomienda mejorar las conclusiones y proyección de trabajos futuros. El sistema tiene potencial real de implementación.',
      Math.floor(t0+14*86400+600), Math.floor(t0+14*86400+600));

  console.log('✅ Evaluaciones de documento y sustentación creadas');

  // ─── 6. Sustentación ──────────────────────────────────────────────────────
  const defense_date = now + 7*86400;
  db.prepare("UPDATE theses SET defense_date=?, defense_location=?, defense_info=? WHERE id=?")
    .run(defense_date,
      'Sala de Juntas A-301, Edificio de Ingeniería',
      'Modalidad presencial. Se requiere presentación mínima de 20 diapositivas y demo funcional del sistema.',
      thesisId);

  console.log('\n=============================');
  console.log('✅ TESIS DEMO CREADA EXITOSAMENTE');
  console.log('Título: Sistema de Gestión Inteligente de Inventarios con IA para PYMES');
  console.log('Tesis ID:', thesisId);
  console.log('Programa: Ingeniería de Sistemas');
  console.log('Estudiante 1: JDMARTINEZ@USBCALI.EDU.CO | contraseña: test1234');
  console.log('Estudiante 2: ACGOMEZ@USBCALI.EDU.CO    | contraseña: test1234');
  console.log('Eval 1: ALBERTO DAVID ESCOBAR SANDOVAL (doc ✓ + oral ✓)');
  console.log('Eval 2: ANDRES F. FERNANDEZ → reemplazado por ALEJANDRO MORENO BRAVO (doc ✓ + oral ✓)');
  console.log('Estado: defense_scheduled (sustentación en 7 días)');
  console.log('=============================\n');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
