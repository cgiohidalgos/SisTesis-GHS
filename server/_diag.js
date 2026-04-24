const db = require('./db');

const row = db.prepare('SELECT id, institutional_email, password_hash FROM users WHERE UPPER(institutional_email) = ?').get('AMORENOB1@USBCALI.EDU.CO');
if (!row) { console.log('NO encontrado'); process.exit(0); }

// Mostrar el valor EXACTO almacenado (con hex para detectar caracteres raros)
const email = row.institutional_email;
console.log('Email exacto:', JSON.stringify(email));
console.log('Longitud email:', email.length);
const hex = Buffer.from(email).toString('hex');
console.log('Hex:', hex);

// Hash info
const hash = row.password_hash;
console.log('Hash:', hash);
console.log('Hash length:', hash.length);
console.log('Hash starts with:', hash.substring(0, 7));

// Revisar logs/tokens de recuperación de contraseña pendientes
const tokens = db.prepare("SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").all(row.id);
console.log('Reset tokens recientes:', tokens.length > 0 ? JSON.stringify(tokens, null, 2) : 'ninguno');

process.exit(0);
