const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

// Crear transporte según config
function createTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === 'SSL',
    auth: {
      user: config.username,
      pass: config.password,
    },
  });
}

// Obtener config SMTP (del usuario o la default del superadmin)
function getSMTPConfig(db, userId) {
  // Primero intenta config del usuario
  let config = db.prepare('SELECT * FROM smtp_config WHERE user_id = ?').get(userId);
  if (config) return config;

  // Si no, usa la default (superadmin)
  config = db.prepare('SELECT * FROM smtp_config WHERE is_default = 1').get();
  return config;
}

// Enviar email
async function sendEmail(db, toEmail, subject, body, userId) {
  const config = getSMTPConfig(db, userId);
  if (!config) {
    console.error('No SMTP config available');
    return false;
  }

  try {
    const transporter = createTransport(config);
    const info = await transporter.sendMail({
      from: config.username,
      to: toEmail,
      subject,
      html: body,
    });
    console.log('Email enviado:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error enviando email:', error);
    return false;
  }
}

// Registrar notificación en BD
function logNotification(db, userId, eventType, subject, body, relatedThesisId = null, error = null) {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO notifications (id, user_id, event_type, subject, body, related_thesis_id, sent_at, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, eventType, subject, body, relatedThesisId, error ? null : now, error, now);
  return id;
}

// Notificar evento
async function notifyEvent(db, eventType, data) {
  const { thesisId, userId, studentName, evaluatorName, message } = data;

  // Obtener roles y usuarios para determinar a quién notificar
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(userId).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');

  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesisId);
  if (!thesis) return;

  const students = db.prepare('SELECT user_id FROM thesis_students WHERE thesis_id = ?').all(thesisId).map(r => r.user_id);
  const admins = db.prepare('SELECT DISTINCT user_id FROM user_roles WHERE role IN ("admin", "superadmin")').all().map(r => r.user_id);

  let subject, body, recipientIds = [];

  switch (eventType) {
    case 'evaluation_submitted':
      subject = `Evaluación de ${thesis.title} completada`;
      body = `<p>El evaluador <strong>${evaluatorName}</strong> ha completado la evaluación.</p>`;
      recipientIds = [userId, ...admins]; // El evaluador y todos los admins
      break;

    case 'defense_scheduled':
      subject = `Defensa de ${thesis.title} programada`;
      body = `<p>La defensa ha sido programada. ${message || ''}</p>`;
      recipientIds = [...students, ...admins]; // Estudiantes y admins
      break;

    case 'signature_requested':
      subject = `Se requiere firma para ${thesis.title}`;
      body = `<p>Se ha generado un enlace de firma para usted. ${message || ''}</p>`;
      recipientIds = [userId]; // Solo el firmante
      break;

    case 'signature_received':
      subject = `Firma recibida para ${thesis.title}`;
      body = `<p>Se ha registrado una firma de <strong>${evaluatorName}</strong>.</p>`;
      recipientIds = admins; // Solo admins
      break;

    case 'all_signatures_complete':
      subject = `Acta de ${thesis.title} completada`;
      body = `<p>Todas las firmas han sido registradas. El acta está completa.</p>`;
      recipientIds = [...students, ...admins];
      break;

    default:
      return;
  }

  // Enviar a cada destinatario
  for (const recipientId of recipientIds) {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(recipientId);
    if (!user || !user.email) continue;

    const success = await sendEmail(db, user.email, subject, body, userId);
    logNotification(db, recipientId, eventType, subject, body, thesisId, success ? null : 'failed');
  }
}

module.exports = {
  sendEmail,
  logNotification,
  notifyEvent,
  getSMTPConfig,
  createTransport,
};
