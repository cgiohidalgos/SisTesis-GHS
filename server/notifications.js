const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

// Eventos de actas — solo para admins y evaluadores, nunca para estudiantes
const ACT_EVENTS = new Set(['act_signature']);

// Mapa de etiquetas legibles para cada tipo de evento
const EVENT_LABELS = {
  submitted:            'Tesis enviada a evaluación',
  admin_feedback:       'Comentario del administrador',
  admin_decision:       'Decisión del administrador',
  evaluators_assigned:  'Evaluadores asignados',
  review_ok:            'Revisión aprobada',
  review_fail:          'Revisión con observaciones',
  revision_submitted:   'Estudiante envió revisión',
  evaluation_submitted: 'Evaluación enviada',
  defense_scheduled:    'Sustentación programada',
  act_signature:        'Firma de acta registrada',
  status_changed:       'Estado de la tesis actualizado',
};

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === 'SSL',
    auth: { user: config.username, pass: config.password },
  });
}

function getSMTPConfig(db, userId) {
  if (userId) {
    const cfg = db.prepare('SELECT * FROM smtp_config WHERE user_id = ?').get(userId);
    if (cfg) return cfg;
  }
  // Intentar config default primero, luego cualquier config disponible
  return db.prepare('SELECT * FROM smtp_config WHERE is_default = 1').get()
    || db.prepare('SELECT * FROM smtp_config LIMIT 1').get()
    || null;
}

async function sendEmail(db, toEmail, subject, body, smtpOwnerId) {
  const config = getSMTPConfig(db, smtpOwnerId);
  if (!config) { console.error('[notify] Sin config SMTP'); return false; }
  try {
    const transporter = createTransport(config);
    const info = await transporter.sendMail({ from: config.username, to: toEmail, subject, html: body });
    console.log('[notify] Email enviado:', info.messageId);
    return true;
  } catch (err) {
    console.error('[notify] Error enviando email:', err.message);
    return false;
  }
}

async function sendWelcomeEmail(db, toEmail, fullName, username, password, smtpOwnerId) {
  const subject = '[SisTesis] Bienvenido al sistema';
  const body = `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1a1a2e">Bienvenido${fullName ? `, ${fullName}` : ''}</h2>
      <p>Tu cuenta ha sido creada en el sistema <strong>SisTesis</strong>.</p>
      <h3 style="margin-top:20px;color:#1a1a2e;">Datos de acceso</h3>
      <ul style="padding-left:18px;">
        <li><strong>URL:</strong> <a href="https://lidis.usbcali.edu.co/sistesis/">https://lidis.usbcali.edu.co/sistesis/</a></li>
        <li><strong>Usuario:</strong> ${username}</li>
        <li><strong>Contraseña:</strong> ${password}</li>
      </ul>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
      <p style="color:#888;font-size:12px">Si no solicitaste esta cuenta, ignora este correo.</p>
    </div>
  `;
  return await sendEmail(db, toEmail, subject, body, smtpOwnerId);
}

async function notifyEvaluatorRemoved(db, thesisId, evaluatorId, triggeredBy) {
  const evaluator = db.prepare('SELECT id, full_name, institutional_email FROM users WHERE id = ?').get(evaluatorId);
  if (!evaluator || !evaluator.institutional_email) return;

  const thesis = db.prepare('SELECT title FROM theses WHERE id = ?').get(thesisId);
  if (!thesis) return;

  const students = db.prepare(
    `SELECT u.full_name FROM users u
     JOIN thesis_students ts ON u.id = ts.student_id
     WHERE ts.thesis_id = ?`
  ).all(thesisId);

  const studentList = students.map(s => `• ${s.full_name || 'Estudiante'}`).join('<br />');

  const subject = `[SisTesis] Ya no eres evaluador de la tesis: ${thesis.title}`;
  const body = `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1a1a2e">Cambio de asignación de evaluador</h2>
      <p>Hola <strong>${evaluator.full_name || 'Evaluador'}</strong>,</p>
      <p>Ya no estás asignado como evaluador para la siguiente tesis:</p>
      <p><strong>Tesis:</strong> ${thesis.title}</p>
      <p><strong>Estudiantes:</strong><br />${studentList}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
      <p style="color:#888;font-size:12px">Si crees que esto es un error, contacta al administrador del sistema.</p>
    </div>
  `;

  const success = await sendEmail(db, evaluator.institutional_email, subject, body, triggeredBy);
  logNotification(db, evaluator.id, 'evaluator_removed', subject, body, thesisId, success ? null : 'failed');
}

async function notifyEvaluatorAssigned(db, thesisId, evaluatorId, triggeredBy) {
  const evaluator = db.prepare('SELECT id, full_name, institutional_email FROM users WHERE id = ?').get(evaluatorId);
  if (!evaluator || !evaluator.institutional_email) return;

  const thesis = db.prepare('SELECT title FROM theses WHERE id = ?').get(thesisId);
  if (!thesis) return;

  const students = db.prepare(
    `SELECT u.full_name, u.institutional_email FROM users u
     JOIN thesis_students ts ON u.id = ts.student_id
     WHERE ts.thesis_id = ?`
  ).all(thesisId);

  const studentList = students.map(s => `• ${s.full_name || 'Estudiante'} (${s.institutional_email || 'sin correo'})`).join('<br />');

  // Generar contraseña del evaluador (mismo formato usado en seed: nombre_lowercase + cedula)
  const evalCedula = db.prepare('SELECT cedula FROM users WHERE id = ?').get(evaluatorId)?.cedula;
  const evalFirstName = (evaluator.full_name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario';
  const evalPassword = evalCedula ? `${evalFirstName}${evalCedula}` : null;

  const subject = `[SisTesis] Has sido asignado como evaluador de la tesis: ${thesis.title}`;
  const body = `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1a1a2e">Nueva asignación de evaluación</h2>
      <p>Hola <strong>${evaluator.full_name || 'Evaluador'}</strong>,</p>
      <p>Has sido asignado como evaluador para la siguiente tesis:</p>
      <div style="background:#f8f9fa;border-left:4px solid #1a1a2e;padding:12px 16px;margin:16px 0;border-radius:4px">
        <p style="margin:4px 0"><strong>Tesis:</strong> ${thesis.title}</p>
        <p style="margin:4px 0"><strong>Estudiantes:</strong></p>
        ${studentList}
      </div>
      <h3 style="margin-top:24px;color:#1a1a2e">Datos de acceso al sistema</h3>
      <ul style="padding-left:18px;">
        <li><strong>URL:</strong> <a href="https://lidis.usbcali.edu.co/sistesis/">https://lidis.usbcali.edu.co/sistesis/</a></li>
        <li><strong>Usuario:</strong> ${evaluator.institutional_email}</li>
        ${evalPassword ? `<li><strong>Contraseña:</strong> ${evalPassword}</li>` : '<li><em>Usa la contraseña proporcionada al crear tu cuenta.</em></li>'}
      </ul>
      <p style="margin-top:16px">Por favor ingresa al sistema para revisar el documento y registrar tu evaluación.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
      <p style="color:#888;font-size:12px">Este correo fue enviado automáticamente por el sistema SisTesis. Si tienes dudas, contacta al administrador.</p>
    </div>
  `;

  const success = await sendEmail(db, evaluator.institutional_email, subject, body, triggeredBy);
  logNotification(db, evaluator.id, 'evaluator_assigned', subject, body, thesisId, success ? null : 'failed');
}

function logNotification(db, userId, eventType, subject, body, relatedThesisId, error) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, event_type, subject, body, related_thesis_id, sent_at, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, eventType, subject, body, relatedThesisId || null, error ? null : Math.floor(Date.now()/1000), error || null, Math.floor(Date.now()/1000));
}

/**
 * Notifica un evento del timeline de una tesis.
 *
 * @param {object} db           - Instancia de better-sqlite3
 * @param {string} thesisId     - ID de la tesis
 * @param {string} eventType    - Tipo de evento (submitted, admin_feedback, etc.)
 * @param {string} description  - Descripción del evento (texto del timeline)
 * @param {string} triggeredBy  - user_id del usuario que disparó el evento
 */
/**
 * Reemplaza {{variable}} en una plantilla con los valores del contexto.
 * Las variables no encontradas se reemplazan con cadena vacía.
 */
function renderTemplate(template, ctx) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (ctx[key] !== undefined && ctx[key] !== null) ? ctx[key] : '');
}

async function notifyTimeline(db, thesisId, eventType, description, triggeredBy) {
  try {
    const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesisId);
    if (!thesis) return;

    // Datos de contexto compartido para plantillas
    const studentRows   = db.prepare(`SELECT u.full_name, u.institutional_email FROM users u JOIN thesis_students ts ON u.id = ts.student_id WHERE ts.thesis_id = ?`).all(thesisId);
    const evaluatorRows = db.prepare(`SELECT u.full_name, te.is_blind FROM users u JOIN thesis_evaluators te ON u.id = te.evaluator_id WHERE te.thesis_id = ?`).all(thesisId);
    const programRows   = db.prepare(`SELECT p.name FROM programs p JOIN thesis_programs tp ON p.id = tp.program_id WHERE tp.thesis_id = ?`).all(thesisId);

    const defenseDateStr = thesis.defense_date
      ? new Date(thesis.defense_date * 1000).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';

    const baseCtx = {
      titulo_tesis:         thesis.title || '',
      descripcion:          description || '',
      nombres_estudiantes:  studentRows.map(s => s.full_name || '').join(', '),
      correos_estudiantes:  studentRows.map(s => s.institutional_email || '').join(', '),
      nombres_evaluadores:  evaluatorRows.some(e => e.is_blind) ? 'pares ciegos' : evaluatorRows.map(e => e.full_name || '').join(', '),
      programa:             programRows.map(p => p.name).join(', '),
      fecha:                new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
      fecha_sustentacion:   defenseDateStr,
      lugar_sustentacion:   thesis.defense_location || '',
      info_sustentacion:    thesis.defense_info || '',
    };

    // Cargar plantilla configurada (o fallback genérico)
    let label = EVENT_LABELS[eventType] || eventType;
    // For defense_scheduled, use the verb from the description (programada vs reprogramada)
    if (eventType === 'defense_scheduled' && description && description.startsWith('Sustentación reprogramada')) {
      label = 'Sustentación reprogramada';
    }
    const tpl = db.prepare('SELECT subject, body_html FROM notification_templates WHERE event_type = ?').get(eventType);
    const subjectTpl  = tpl?.subject   || `[SisTesis] ${label}: {{titulo_tesis}}`;
    const bodyTpl     = tpl?.body_html || `<div style="font-family:sans-serif;max-width:600px"><p>Hola <strong>{{destinatario_nombre}}</strong>,</p><p><strong>Tesis:</strong> {{titulo_tesis}}</p><p><strong>Detalle:</strong> {{descripcion}}</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0"><p style="color:#888;font-size:12px">Sistema SisTesis — Facultad de Ingeniería USB Cali</p></div>`;

    // Obtener IDs de usuarios involucrados
    const studentIds   = studentRows.length
      ? db.prepare('SELECT student_id FROM thesis_students WHERE thesis_id = ?').all(thesisId).map(r => r.student_id)
      : [];
    const evaluatorIds = db.prepare('SELECT evaluator_id FROM thesis_evaluators WHERE thesis_id = ?').all(thesisId).map(r => r.evaluator_id);
    const adminIds     = db.prepare("SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin','superadmin')").all().map(r => r.user_id);
    const directorIds  = db.prepare('SELECT user_id FROM thesis_directors WHERE thesis_id = ? AND user_id IS NOT NULL').all(thesisId).map(r => r.user_id);

    // Leer reglas configurables de la BD
    const rules = db.prepare('SELECT role, enabled FROM notification_rules WHERE event_type = ?').all(eventType);
    let recipientIds = [];
    if (rules.length > 0) {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (rule.role === 'student')   recipientIds.push(...studentIds);
        if (rule.role === 'admin')     recipientIds.push(...adminIds);
        if (rule.role === 'evaluator') recipientIds.push(...evaluatorIds);
        if (rule.role === 'director')  recipientIds.push(...directorIds);
      }
    } else {
      recipientIds = ACT_EVENTS.has(eventType)
        ? [...adminIds, ...evaluatorIds]
        : [...studentIds, ...evaluatorIds, ...adminIds, ...directorIds];
    }

    const uniqueIds = [...new Set(recipientIds)].filter(id => id !== triggeredBy);
    const smtpOwnerId = triggeredBy || null;

    for (const recipientId of uniqueIds) {
      const user = db.prepare('SELECT id, full_name, institutional_email FROM users WHERE id = ?').get(recipientId);
      if (!user || !user.institutional_email) continue;

      // Contexto personalizado por destinatario
      const ctx = { ...baseCtx, destinatario_nombre: user.full_name || 'Usuario' };
      const renderedSubject = renderTemplate(subjectTpl, ctx);
      const renderedBody    = renderTemplate(bodyTpl, ctx);

      const success = await sendEmail(db, user.institutional_email, renderedSubject, renderedBody, smtpOwnerId);
      logNotification(db, recipientId, eventType, renderedSubject, renderedBody, thesisId, success ? null : 'failed');
    }
  } catch (err) {
    console.error('[notify] Error en notifyTimeline:', err.message);
  }
}

/**
 * Inicia el cron job que envía recordatorios diarios a evaluadores.
 * Corre todos los días a las 8:00 AM.
 * Notifica evaluadores con due_date en 7, 3 o 1 día(s).
 */
function startReminderCron(db) {
  let cron;
  try { cron = require('node-cron'); } catch (e) {
    console.warn('[cron] node-cron no disponible, recordatorios desactivados');
    return;
  }

  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Ejecutando recordatorios de evaluaciones pendientes...');
    // due_date está guardado en segundos Unix (igual que el dashboard)
    const nowSec = Math.floor(Date.now() / 1000);
    const daySec = 24 * 3600;
    const windows = [
      { days: 1, label: 'mañana' },
      { days: 3, label: 'en 3 días' },
      { days: 7, label: 'en 7 días' },
    ];

    for (const { days, label } of windows) {
      const from = nowSec + (days - 1) * daySec;
      const to   = nowSec + days * daySec;

      const pending = db.prepare(`
        SELECT te.id, te.evaluator_id, te.thesis_id, te.due_date,
               t.title, u.institutional_email, u.full_name
        FROM thesis_evaluators te
        JOIN theses t ON t.id = te.thesis_id
        JOIN users u ON u.id = te.evaluator_id
        WHERE te.due_date IS NOT NULL
          AND te.due_date >= ? AND te.due_date < ?
          AND t.status NOT IN ('finalized','deleted')
      `).all(from, to);

      for (const row of pending) {
        if (!row.institutional_email) continue;

        // Evitar enviar recordatorio duplicado el mismo día
        const alreadySent = db.prepare(`
          SELECT id FROM notifications
          WHERE user_id = ? AND event_type = 'reminder'
            AND related_thesis_id = ? AND created_at > ?
        `).get(row.evaluator_id, row.thesis_id, nowSec - daySec);
        if (alreadySent) continue;

        const subject = `[SisTesis] Recordatorio: evaluación vence ${label}`;
        const body = `
          <div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#1a1a2e">Recordatorio de evaluación pendiente</h2>
            <p>Hola <strong>${row.full_name || 'Evaluador'}</strong>,</p>
            <p>Tienes una evaluación pendiente que vence <strong>${label}</strong>:</p>
            <p style="font-size:16px;font-weight:bold">${row.title}</p>
            <p>Fecha límite: <strong>${new Date(row.due_date * 1000).toLocaleDateString('es-CO')}</strong></p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
            <p style="color:#888;font-size:12px">Sistema SisTesis — Facultad de Ingeniería USB Cali</p>
          </div>
        `;

        const success = await sendEmail(db, row.institutional_email, subject, body, null);
        logNotification(db, row.evaluator_id, 'reminder', subject, body, row.thesis_id, success ? null : 'failed');
        console.log(`[cron] Recordatorio enviado a ${row.institutional_email} (tesis: ${row.title})`);
      }
    }
    console.log('[cron] Recordatorios completados.');
  }, { timezone: 'America/Bogota' });

  console.log('[cron] Recordatorios automáticos activados (8:00 AM hora Bogotá)');
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  logNotification,
  notifyEvent: notifyTimeline,
  notifyTimeline,
  notifyEvaluatorRemoved,
  notifyEvaluatorAssigned,
  getSMTPConfig,
  createTransport,
  startReminderCron,
};
