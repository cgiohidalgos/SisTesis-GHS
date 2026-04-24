const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('data/data.sqlite');

const now = Math.floor(Date.now() / 1000);
const dueDate = now + 30 * 86400;

const eval1 = '00922624-41a1-4b05-95e9-985129eb615b'; // LUIS FERNANDO
const eval2 = '00ffacbb-afaf-46dd-870d-7ec2407ac477'; // ANTONIO JOSE
const studentId = '0099eeeb-e222-41a7-8856-13f41af97add';
const programId = '15962e8f-61b8-4716-be30-09d40749563c';
const adminId = '0099eeeb-e222-41a7-8856-13f41af97add';

const scenarios = [
  { title: 'Prueba 1 - Ningún evaluador ha enviado', status: 'evaluators_assigned' },
  { title: 'Prueba 2 - Solo un evaluador ha enviado', status: 'en_evaluacion' },
  { title: 'Prueba 3 - Ambos enviaron con cambios menores', status: 'en_evaluacion' },
  { title: 'Prueba 4 - Ambos aceptaron para sustentación', status: 'evaluacion_terminada' },
];

const thesisIds = [];

const run = db.transaction(() => {
  for (const s of scenarios) {
    const tid = uuidv4();
    thesisIds.push(tid);

    db.prepare(
      'INSERT INTO theses (id, title, abstract, status, created_by, created_at, revision_round) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(tid, s.title, 'Tesis de prueba para simular escenario de evaluación.', s.status, adminId, now, 0);

    db.prepare('INSERT INTO thesis_students (thesis_id, student_id) VALUES (?, ?)').run(tid, studentId);
    db.prepare('INSERT INTO thesis_programs (thesis_id, program_id) VALUES (?, ?)').run(tid, programId);
    db.prepare(
      'INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), tid, 'status_changed', 'Proyecto enviado', 1, now);

    db.prepare(
      'INSERT INTO thesis_evaluators (id, thesis_id, evaluator_id, assigned_at, due_date, is_blind) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), tid, eval1, now, dueDate, 1);
    db.prepare(
      'INSERT INTO thesis_evaluators (id, thesis_id, evaluator_id, assigned_at, due_date, is_blind) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), tid, eval2, now, dueDate, 1);
  }

  const getTE = (tid, eid) =>
    db.prepare('SELECT id FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(tid, eid);

  const insertEval = (teId, concept, obs, ts) =>
    db.prepare(
      'INSERT INTO evaluations (id, thesis_evaluator_id, concept, evaluation_type, submitted_at, revision_round, general_observations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), teId, concept, 'document', ts, 0, obs, ts);

  // Prueba 2: solo eval1 envió (minor_changes)
  insertEval(getTE(thesisIds[1], eval1).id, 'minor_changes', 'Hay correcciones menores pendientes.', now);

  // Prueba 3: ambos enviaron — eval1=minor_changes, eval2=accepted
  insertEval(getTE(thesisIds[2], eval1).id, 'minor_changes', 'Correcciones menores requeridas.', now);
  insertEval(getTE(thesisIds[2], eval2).id, 'accepted', 'Trabajo aceptado por este evaluador.', now - 10);

  // Prueba 4: ambos aceptaron
  insertEval(getTE(thesisIds[3], eval1).id, 'accepted', 'Excelente trabajo.', now - 20);
  insertEval(getTE(thesisIds[3], eval2).id, 'accepted', 'Aprobado para sustentación.', now - 10);
});

run();
console.log('Creados OK:', thesisIds);
