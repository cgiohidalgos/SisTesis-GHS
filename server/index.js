const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const util = require('util');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { imageSize } = require('image-size');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { notifyTimeline, startReminderCron, startBackupCron, sendEmail, sendWelcomeEmail, notifyEvaluatorAssigned, logNotification } = require('./notifications');
const logger = require('./logger');

const execPromise = util.promisify(exec);

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
// Confiar en el proxy nginx para obtener la IP real del cliente
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/auth/session' || req.path === '/health',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 login attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Log uncaught errors to help diagnose crashes
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION', { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION', { reason: reason });
  process.exit(1);
});

// Logging de todas las peticiones para depuración de CORS y preflight
app.use(logger.httpLog.bind(logger));
app.use(cors({
  exposedHeaders: ['Content-Disposition'],
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
// Manejo explícito de preflight OPTIONS para todas las rutas
app.options('*', cors({
  exposedHeaders: ['Content-Disposition'],
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// other middleware and helper functions might go here


// Subida de archivos y registro de directores para tesis
// moved below authMiddleware and upload definitions

// ...existing code...

const db = require('./db');

// Migration: add cvlac column to users if not present
try { db.prepare('ALTER TABLE users ADD COLUMN cvlac TEXT').run(); } catch (_) {}

// Helper: Unix timestamp en segundos (consistente con SQLite strftime('%s','now'))
const nowSec = () => Math.floor(Date.now() / 1000);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = '7d';

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ 
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 5 // max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and images are allowed.'), false);
    }
  }
});

const toDateTime = (ts) => ts ? new Date(Number(ts)).toLocaleString('es-CO') : '';
const toDateOnly = (ts) => ts ? new Date(Number(ts)).toLocaleDateString('es-CO') : '';

function scoreClassification(score) {
  if (score >= 4.8) return 'APROBADA MERITORIA';
  if (score >= 3.0) return 'APROBADA';
  return 'NO APROBADA';
}

function scoreToSpanishText(score) {
  const digits = ['CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE'];
  const fixed = Number(score || 0).toFixed(1);
  const [whole, decimals] = fixed.split('.');
  return `${digits[Number(whole)] || whole} PUNTO ${digits[Number(decimals[0])] || decimals[0]}`;
}

// Genera tabla de firmas dinámicamente según los datos disponibles
function generateSignatureTableXml(data) {
  const { evaluators, directors, programDirectors } = data;
  
  // Helper para generar una celda con firma (espacio arriba para firma, nombre/rol abajo)
  const createCell = (name, role, firma = '') => {
    if (!name) return null;
    return `<w:tc>
<w:tcPr><w:tcW w:w="4536" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${firma}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>________________________</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="20"/></w:rPr><w:t>${name}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:i/><w:sz w:val="18"/></w:rPr><w:t>${role}</w:t></w:r></w:p>
</w:tc>`;
  };

  // Helper para generar una fila con 1 o 2 celdas
  const createRow = (cells) => {
    const validCells = cells.filter(c => c !== null);
    if (validCells.length === 0) return '';
    
    // Si solo hay 1 celda, usar colspan (merge horizontal)
    if (validCells.length === 1) {
      return `<w:tr>
<w:trPr><w:trHeight w:val="2400" w:hRule="atLeast"/></w:trPr>
<w:tc>
<w:tcPr><w:tcW w:w="9072" w:type="dxa"/><w:gridSpan w:val="2"/><w:vAlign w:val="bottom"/></w:tcPr>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${cells[0]?.firma || ''}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>________________________</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="20"/></w:rPr><w:t>${cells[0]?.name || ''}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:i/><w:sz w:val="18"/></w:rPr><w:t>${cells[0]?.role || ''}</w:t></w:r></w:p>
</w:tc>
</w:tr>`;
    }
    
    // 2 celdas normales
    return `<w:tr>
<w:trPr><w:trHeight w:val="2400" w:hRule="atLeast"/></w:trPr>
${validCells.join('\n')}
</w:tr>`;
  };

  // Construir filas
  const rows = [];

  // Fila 1: Evaluadores (siempre 2)
  const evalCells = [
    createCell(evaluators[0]?.name, 'Jurado', evaluators[0]?.firma || ''),
    createCell(evaluators[1]?.name, 'Jurado', evaluators[1]?.firma || '')
  ];
  if (evalCells.some(c => c !== null)) {
    rows.push(`<w:tr>
<w:trPr><w:trHeight w:val="2400" w:hRule="atLeast"/></w:trPr>
${evalCells.filter(c => c !== null).join('\n')}
</w:tr>`);
  }

  // Obtener datos de directores y directores de programa
  const dirCells = directors.filter(d => d.name).map(d => ({
    name: d.name,
    role: 'Director de Proyecto de Grado',
    firma: d.firma || ''
  }));
  
  const progCells = programDirectors.filter(p => p.name).map(p => ({
    name: p.name,
    role: `Director del Programa de ${p.program || 'Programa Académico'}`,
    firma: p.firma || ''
  }));

  // CASO ESPECIAL: 1 director Y 1 director de programa → misma fila (tabla 2x2)
  if (dirCells.length === 1 && progCells.length === 1) {
    rows.push(`<w:tr>
<w:trPr><w:trHeight w:val="2400" w:hRule="atLeast"/></w:trPr>
${createCell(dirCells[0].name, dirCells[0].role, dirCells[0].firma)}
${createCell(progCells[0].name, progCells[0].role, progCells[0].firma)}
</w:tr>`);
  } else {
    // Caso general: filas separadas para directores y directores de programa
    
    // Fila de directores de tesis
    if (dirCells.length === 1) {
      rows.push(createRow([dirCells[0]]));
    } else if (dirCells.length >= 2) {
      rows.push(`<w:tr>
<w:trPr><w:trHeight w:val="2400" w:hRule="atLeast"/></w:trPr>
${createCell(dirCells[0].name, dirCells[0].role, dirCells[0].firma)}
${createCell(dirCells[1].name, dirCells[1].role, dirCells[1].firma)}
</w:tr>`);
    }

    // Fila de directores de programa
    if (progCells.length === 1) {
      rows.push(createRow([progCells[0]]));
    } else if (progCells.length >= 2) {
      rows.push(`<w:tr>
<w:trPr><w:trHeight w:val="2400" w:hRule="atLeast"/></w:trPr>
${createCell(progCells[0].name, progCells[0].role, progCells[0].firma)}
${createCell(progCells[1].name, progCells[1].role, progCells[1].firma)}
</w:tr>`);
    }
  }

  // Construir tabla completa
  return `<w:tbl>
<w:tblPr>
<w:tblW w:w="9072" w:type="dxa"/>
<w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
</w:tblBorders>
<w:tblLayout w:type="fixed"/>
</w:tblPr>
<w:tblGrid>
<w:gridCol w:w="4536"/>
<w:gridCol w:w="4536"/>
</w:tblGrid>
${rows.join('\n')}
</w:tbl>`;
}

function computeFinalWeightedForThesis(thesisId) {
  const docWeight = Number((db.prepare('SELECT value FROM settings WHERE key = ?').get('doc_weight') || {}).value || 70);
  const presWeight = Number((db.prepare('SELECT value FROM settings WHERE key = ?').get('presentation_weight') || {}).value || 30);
  const thesis = db.prepare('SELECT defense_date, final_weighted_override, status FROM theses WHERE id = ?').get(thesisId);
  const evaluations = db.prepare(
    `SELECT e.final_score, e.evaluation_type
     FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ?`
  ).all(thesisId);
  const docScores = evaluations.filter(e => e.evaluation_type !== 'presentation' && e.final_score != null).map(e => Number(e.final_score));
  const presScores = evaluations.filter(e => e.evaluation_type === 'presentation' && e.final_score != null).map(e => Number(e.final_score));
  const docAvg = docScores.length ? (docScores.reduce((a,b)=>a+b,0) / docScores.length) : 0;
  const presAvg = presScores.length ? (presScores.reduce((a,b)=>a+b,0) / presScores.length) : 0;
  const computed = thesis && thesis.defense_date
    ? (docAvg * (docWeight / 100)) + (presAvg * (presWeight / 100))
    : docAvg;
  // if override exists and thesis is finalized, use it
  const finalScore = (thesis && thesis.status === 'finalized' && thesis.final_weighted_override != null)
    ? Number(thesis.final_weighted_override)
    : computed;

  return { finalScore, docAvg, presAvg };
}

// Función para replicar la tabla de firmas para múltiples pares
function replicateSignatureTable(documentXml, pairs) {
  // Si solo hay 1 par o menos, no es necesario replicar
  if (pairs.length <= 1) {
    return documentXml;
  }
  
  try {
    // Encontrar la tabla de firmas (contiene {persona1_nombre}, {persona2_nombre})
    // Ignorar la tabla del programa (que es la última)
    const tablePattern = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    let tables = [];
    let match;
    while ((match = tablePattern.exec(documentXml)) !== null) {
      tables.push({ start: match.index, end: match.index + match[0].length, content: match[0] });
    }
    
    if (tables.length === 0) {
      console.warn('⚠️  No tables found in document');
      return documentXml;
    }
    
    // Encontrar la tabla de firmas (penúltima si hay tabla de programa al final)
    // La tabla de firmas tiene los placeholders {persona1_nombre} y {persona2_nombre}
    let firsSignatoryTableIndex = -1;
    for (let i = tables.length - 1; i >= 0; i--) {
      if (tables[i].content.includes('{persona1_nombre}') || tables[i].content.includes('persona1_nombre')) {
        firsSignatoryTableIndex = i;
        break;
      }
    }
    
    if (firsSignatoryTableIndex === -1) {
      console.warn('⚠️  Signature table not found');
      return documentXml;
    }
    
    const sourceTable = tables[firsSignatoryTableIndex];
    let beforeTable = documentXml.substring(0, sourceTable.end);
    let afterTable = documentXml.substring(sourceTable.end);
    
    // Para cada par adicional (ignorar el primero que ya está en el template)
    for (let pairIndex = 1; pairIndex < pairs.length; pairIndex++) {
      const pair = pairs[pairIndex];
      
      // Clonar la tabla
      let newTable = sourceTable.content;
      
      const persona1Nombre = pair.persona1?.signer_name || '';
      const persona2Nombre = pair.persona2?.signer_name || '';
      const rol1 = pair.persona1?.signer_role === 'director' ? 'Director(a) del Proyecto' : 'Jurado Evaluador(a)';
      const rol2 = pair.persona2?.signer_role === 'director' ? 'Director(a) del Proyecto' : 'Jurado Evaluador(a)';
      const firma1 = pair.persona1 ? `[Firma registrada: ${pair.persona1.signer_name}]` : '';
      const firma2 = pair.persona2 ? `[Firma registrada: ${pair.persona2.signer_name}]` : '';
      
      // Reemplazar placeholders con datos del nuevo par
      newTable = newTable.replace(/{persona1_nombre}/g, persona1Nombre);
      newTable = newTable.replace(/{persona2_nombre}/g, persona2Nombre);
      newTable = newTable.replace(/{persona1_rol}/g, rol1);
      newTable = newTable.replace(/{persona2_rol}/g, rol2 || '');
      
      // Reemplazar placeholders para firmas
      newTable = newTable.replace(/{firma1}/g, firma1);
      newTable = newTable.replace(/{firma2}/g, firma2);
      
      console.log(`  ✓ Tabla ${pairIndex}: ${persona1Nombre} + ${persona2Nombre}`);
      
      // Insertar la nueva tabla después de la anterior
      beforeTable += newTable;
    }
    
    return beforeTable + afterTable;
  } catch (error) {
    console.error('Error replicando tabla de firmas:', error);
    return documentXml;
  }
}

// Función para corregir mc:Ignorable con prefijos no declarados (artefacto de python-docx)
function fixMcIgnorable(documentXml) {
  const rootMatch = documentXml.match(/<w:document([^>]*)>/);
  if (!rootMatch) return documentXml;
  const rootAttrs = rootMatch[1];

  // Construir mapa URI → prefijo declarado
  const uriToPrefix = {};
  const nsRegex = /xmlns:(\w+)="([^"]*)"/g;
  let m;
  while ((m = nsRegex.exec(rootAttrs)) !== null) {
    uriToPrefix[m[2]] = m[1];
  }

  // Mapa de prefijos estándar de Word → URI
  const stdPrefixToUri = {
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
    'w16se': 'http://schemas.microsoft.com/office/word/2015/wordml/symex',
    'w16cid': 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
    'w16': 'http://schemas.microsoft.com/office/word/2018/wordml',
    'w16cex': 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
    'w16sdtdh': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
    'w16sdtfl': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdataformatting',
    'w16du': 'http://schemas.microsoft.com/office/word/2023/wordml/word16du',
    'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  };

  // Buscar el atributo mc:Ignorable (puede ser ns1:Ignorable, etc.)
  const ignMatch = rootAttrs.match(/(\w+:Ignorable)="([^"]*)"/);
  if (!ignMatch) return documentXml;

  const ignAttrName = ignMatch[1];
  const oldPrefixes = ignMatch[2].split(/\s+/).filter(Boolean);

  // Reemplazar cada prefijo por el correcto (el declarado en este documento) o añadir declaración
  let newRootAttrs = rootAttrs;
  const newPrefixes = [];
  let modified = false;

  for (const oldP of oldPrefixes) {
    // Si el prefijo ya está declarado, mantenerlo tal cual
    if (newRootAttrs.includes(`xmlns:${oldP}="`)) {
      newPrefixes.push(oldP);
      continue;
    }
    // Buscar si la URI de este prefijo estándar ya tiene otro prefijo declarado
    const uri = stdPrefixToUri[oldP];
    if (uri && uriToPrefix[uri]) {
      // Usar el prefijo existente en lugar del estándar
      newPrefixes.push(uriToPrefix[uri]);
      modified = true;
    } else if (uri) {
      // La URI no está declarada; añadir la declaración con el prefijo estándar
      newRootAttrs += ` xmlns:${oldP}="${uri}"`;
      newPrefixes.push(oldP);
      modified = true;
    }
    // Si no conocemos la URI, simplemente omitimos el prefijo
  }

  if (modified) {
    const newIgnorable = `${ignAttrName}="${newPrefixes.join(' ')}"`;
    newRootAttrs = newRootAttrs.replace(/\w+:Ignorable="[^"]*"/, newIgnorable);
    documentXml = documentXml.replace(/<w:document[^>]*>/, `<w:document${newRootAttrs}>`);
    console.log('  ✓ mc:Ignorable corregido:', newPrefixes.join(' '));
  }

  return documentXml;
}

// Función para insertar imágenes de firma en el documento DOCX
function insertSignatureImages(zip, signatures) {
  try {
    // Leer el document.xml
    let documentXml = zip.file('word/document.xml').asText();

    // Corregir mc:Ignorable con prefijos no declarados
    documentXml = fixMcIgnorable(documentXml);

    // Construir mapa URI → prefijo existente en el documento
    const rootMatch = documentXml.match(/<w:document([^>]*)>/);
    const uriToPrefix = {};
    if (rootMatch) {
      const nsRegex = /xmlns:(\w+)="([^"]*)"/g;
      let m;
      while ((m = nsRegex.exec(rootMatch[1])) !== null) {
        uriToPrefix[m[2]] = m[1];
      }
    }

    // Determinar los prefijos correctos para drawing XML
    const wpPrefix = uriToPrefix['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'] || 'wp';
    const aPrefix = uriToPrefix['http://schemas.openxmlformats.org/drawingml/2006/main'] || 'a';
    const picPrefix = uriToPrefix['http://schemas.openxmlformats.org/drawingml/2006/picture'] || 'pic';
    const rPrefix = uriToPrefix['http://schemas.openxmlformats.org/officeDocument/2006/relationships'] || 'r';

    console.log(`  Namespace prefixes: wp=${wpPrefix}, a=${aPrefix}, pic=${picPrefix}, r=${rPrefix}`);

    // Añadir declaraciones de namespace solo si faltan por completo
    const requiredNs = {
      [wpPrefix]: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      [aPrefix]: 'http://schemas.openxmlformats.org/drawingml/2006/main',
      [picPrefix]: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
      [rPrefix]: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    };

    if (rootMatch) {
      let rootAttributes = documentXml.match(/<w:document([^>]*)>/)[1];
      let nsModified = false;
      for (const [prefix, uri] of Object.entries(requiredNs)) {
        if (!rootAttributes.includes(`xmlns:${prefix}="`)) {
          rootAttributes += ` xmlns:${prefix}="${uri}"`;
          nsModified = true;
        }
      }
      if (nsModified) {
        documentXml = documentXml.replace(/<w:document[^>]*>/, `<w:document${rootAttributes}>`);
      }
    }
    
    // Leer o crear el archivo de relaciones
    let relsXml;
    try {
      relsXml = zip.file('word/_rels/document.xml.rels').asText();
    } catch {
      relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    }
    
    // Encontrar el próximo ID de relación disponible
    const relIdMatches = relsXml.match(/Id="rId(\d+)"/g) || [];
    let maxRelId = 0;
    relIdMatches.forEach(match => {
      const id = parseInt(match.match(/\d+/)[0]);
      if (id > maxRelId) maxRelId = id;
    });
    
    let nextRelId = maxRelId + 1;
    let imageCounter = 1;
    
    // Procesar cada firma usando nombres específicos
    signatures.forEach((sig, idx) => {
      if (!sig || !sig.file_url) return;
      
      console.log(`  ⏳ Procesando firma ${idx + 1}/${signatures.length}: ${sig.signer_name}`);
      
      const imagePath = path.join(uploadDir, path.basename(sig.file_url));
      if (!fs.existsSync(imagePath)) {
        console.log(`    ❌ Archivo no encontrado: ${imagePath}`);
        return;
      }
      
      // Leer la imagen
      const imageData = fs.readFileSync(imagePath);
      const imageExt = path.extname(imagePath).slice(1) || 'png';
      
      // Obtener dimensiones de la imagen
      let dimensions;
      try {
        dimensions = imageSize(imageData);
      } catch (err) {
        console.log(`    ⚠️  No se pudo determinar tamaño: ${err.message}`);
        dimensions = { width: 200, height: 100 };
      }
      
      // Calcular dimensiones para el documento (ancho máximo 5cm = ~1800000 EMUs)
      const maxWidth = 1800000; // EMUs (English Metric Units)
      const ratio = dimensions.width / dimensions.height;
      const width = Math.min(maxWidth, dimensions.width * 9525); // convertir px a EMUs
      const height = width / ratio;
      
      const imageFilename = `firma_signature_${idx+1}.${imageExt}`;
      const relId = `rId${nextRelId}`;
      
      // Añadir la imagen al zip
      zip.file(`word/media/${imageFilename}`, imageData);
      
      // Crear el XML de la imagen usando los prefijos correctos del documento
      const docPrId = 1000 + idx; // ID único para evitar conflictos
      const w = Math.round(width);
      const h = Math.round(height);
      const drawingXml = `<w:r><w:drawing><${wpPrefix}:inline distT="0" distB="0" distL="0" distR="0"><${wpPrefix}:extent cx="${w}" cy="${h}"/><${wpPrefix}:effectExtent l="0" t="0" r="0" b="0"/><${wpPrefix}:docPr id="${docPrId}" name="${imageFilename}"/><${wpPrefix}:cNvGraphicFramePr><${aPrefix}:graphicFrameLocks noChangeAspect="1"/></${wpPrefix}:cNvGraphicFramePr><${aPrefix}:graphic><${aPrefix}:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><${picPrefix}:pic><${picPrefix}:nvPicPr><${picPrefix}:cNvPr id="${docPrId}" name="${imageFilename}"/><${picPrefix}:cNvPicPr/></${picPrefix}:nvPicPr><${picPrefix}:blipFill><${aPrefix}:blip ${rPrefix}:embed="${relId}"/><${aPrefix}:stretch><${aPrefix}:fillRect/></${aPrefix}:stretch></${picPrefix}:blipFill><${picPrefix}:spPr><${aPrefix}:xfrm><${aPrefix}:off x="0" y="0"/><${aPrefix}:ext cx="${w}" cy="${h}"/></${aPrefix}:xfrm><${aPrefix}:prstGeom prst="rect"><${aPrefix}:avLst/></${aPrefix}:prstGeom></${picPrefix}:spPr></${picPrefix}:pic></${aPrefix}:graphicData></${aPrefix}:graphic></${wpPrefix}:inline></w:drawing></w:r>`;
      
      // Buscar y reemplazar TODAS las ocurrencias del placeholder en el XML (case-insensitive)
      const escapedName = sig.signer_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholderToFind = `[Firma registrada: ${sig.signer_name}]`;
      console.log(`    🔍 Buscando placeholder: "${placeholderToFind}"`);
      
      const runWithPlaceholder = new RegExp(
        `(<w:r[^>]*>.*?)<w:t[^>]*>\\[Firma registrada: ${escapedName}\\]</w:t>(.*?</w:r>)`,
        'gis'
      );
      
      let replacementCount = 0;
      documentXml = documentXml.replace(runWithPlaceholder, (match, before, after) => {
        replacementCount++;
        return `${before}<w:t></w:t>${after}${drawingXml}`;
      });
      
      if (replacementCount === 0) {
        console.log(`    ⚠️  No encontró placeholder para: ${sig.signer_name}`);
        // Buscar aproximadamente para debug
        const simplePlaceholder = `Firma registrada: ${sig.signer_name}`;
        if (documentXml.includes(simplePlaceholder)) {
          console.log(`    ℹ️  Pero el texto sí aparece en el documento`);
        } else {
          console.log(`    ℹ️  El texto NO aparece en el documento`);
        }
      } else {
        console.log(`    ✓ Firma insertada (${replacementCount} ocurrencia${replacementCount > 1 ? 's' : ''})`);
      }
      
      // Añadir la relación
      const relationshipXml = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFilename}"/>`;
      relsXml = relsXml.replace('</Relationships>', `${relationshipXml}</Relationships>`);
      
      nextRelId++;
      imageCounter++;
    });
    
    // Actualizar los archivos en el zip
    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    
    return zip;
  } catch (error) {
    console.error('Error insertando imágenes de firma:', error);
    return zip;
  }
}

function buildSimplePdf(lines = []) {
  const escaped = lines.map(line => String(line || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
  const content = [
    'BT',
    '/F1 11 Tf',
    '50 800 Td',
    ...escaped.flatMap((line, idx) => idx === 0 ? [`(${line}) Tj`] : ['0 -15 Td', `(${line}) Tj`]),
    'ET'
  ].join('\n');

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj + '\n';
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function getActaContext(thesisId) {
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesisId);
  if (!thesis) return null;
  
  // Obtener programas asociados a la tesis con sus directores
  const programsWithDirectors = db.prepare(
    `SELECT p.id, p.name, pa.user_id as director_id, u.full_name as director_name
     FROM thesis_programs tp
     JOIN programs p ON p.id = tp.program_id
     LEFT JOIN program_admins pa ON pa.program_id = p.id
     LEFT JOIN users u ON pa.user_id = u.id
     WHERE tp.thesis_id = ?`
  ).all(thesisId);
  
  const programName = programsWithDirectors.map(p => p.name).join(', ') || '';
  // Lista de directores de programa (únicos, con nombre de programa)
  const programDirectors = programsWithDirectors
    .filter(p => p.director_name)
    .map(p => ({ id: p.director_id, name: p.director_name, program: p.name }));
  
  const students = db.prepare(
    `SELECT u.id, u.full_name as name, u.student_code, u.cedula, u.institutional_email, u.cvlac
     FROM users u
     JOIN thesis_students ts ON ts.student_id = u.id
     WHERE ts.thesis_id = ?`
  ).all(thesisId);
  const evaluators = db.prepare(
    `SELECT u.id, u.full_name as name
     FROM users u
     JOIN thesis_evaluators te ON te.evaluator_id = u.id
     WHERE te.thesis_id = ?`
  ).all(thesisId);
  const directors = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesisId).map(r => r.name);
  const signatures = db.prepare('SELECT * FROM acta_signatures WHERE thesis_id = ? ORDER BY created_at ASC').all(thesisId)
    .map(s => ({ ...s, file_url: `/uploads/${path.basename(s.file_url)}` }));
  const weighted = computeFinalWeightedForThesis(thesisId);
  return { thesis, students, evaluators, directors, signatures, weighted, programName, programDirectors };
}

function hasEvaluatorCompletedRequired(thesisId, evaluatorId) {
  const thesis = db.prepare('SELECT defense_date FROM theses WHERE id = ?').get(thesisId);
  const evals = db.prepare(
    `SELECT e.evaluation_type
     FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ? AND te.evaluator_id = ?`
  ).all(thesisId, evaluatorId);
  const hasDoc = evals.some(e => e.evaluation_type !== 'presentation');
  const hasPres = evals.some(e => e.evaluation_type === 'presentation');
  return hasDoc && (!thesis?.defense_date || hasPres);
}

// Subida de archivos y registro de directores para tesis
app.post('/theses/:id/files', authMiddleware, upload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'endorsement', maxCount: 1 }
]), (req, res) => {
  const thesis_id = req.params.id;
  const { directors, project_name, abstract, url } = req.body;
  // Validar que el usuario sea estudiante de la tesis
  const isStudent = db.prepare('SELECT 1 FROM thesis_students WHERE thesis_id = ? AND student_id = ?').get(thesis_id, req.user.id);
  if (!isStudent) return res.status(403).json({ error: 'forbidden' });

  // Actualizar nombre y resumen del proyecto si se envían
  if (project_name || abstract) {
    db.prepare('UPDATE theses SET title = ?, abstract = ? WHERE id = ?')
      .run(project_name || '', abstract || '', thesis_id);
  }

  // Guardar archivos subidos
  const files = req.files || {};
  const savedFiles = [];
  for (const field of ['document', 'endorsement']) {
    if (files[field] && files[field][0]) {
      const f = files[field][0];
      
      // Eliminar archivo anterior del mismo tipo (sobrescribir)
      const oldFile = db.prepare('SELECT file_url FROM thesis_files WHERE thesis_id = ? AND file_type = ?').get(thesis_id, field);
      if (oldFile && oldFile.file_url) {
        // Eliminar archivo físico anterior
        const oldPath = path.join(uploadDir, oldFile.file_url);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      // Eliminar registro anterior de la base de datos
      db.prepare('DELETE FROM thesis_files WHERE thesis_id = ? AND file_type = ?').run(thesis_id, field);
      
      const id = uuidv4();
      // store only basename so we can serve via /uploads/:file
      const basename = path.basename(f.path);
      db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, thesis_id, f.originalname, field, basename, req.user.id);
      savedFiles.push({ id, file_name: f.originalname, file_type: field, file_path: basename });
    }
  }
  // Guardar URL si se envía (eliminar la anterior primero)
  if (url) {
    db.prepare("DELETE FROM thesis_files WHERE thesis_id = ? AND file_type = 'url'").run(thesis_id);
    const id = uuidv4();
    db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, thesis_id, url, 'url', url, req.user.id);
    savedFiles.push({ id, file_name: url, file_type: 'url', file_path: url });
  }

  // Guardar directores (pueden ser varios, separados por coma o array)
  if (directors) {
    // primero eliminar los existentes para que las ediciones no acumulen vencidos
    db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(thesis_id);
    let directorList = directors;
    if (typeof directors === 'string') {
      try { directorList = JSON.parse(directors); } catch { directorList = directors.split(',').map(s => s.trim()); }
    }
    for (const name of directorList) {
      if (name && name.length > 1) {
        const matchedUser = db.prepare('SELECT id FROM users WHERE full_name = ?').get(name);
        db.prepare('INSERT INTO thesis_directors (id, thesis_id, name, user_id) VALUES (?, ?, ?, ?)')
          .run(uuidv4(), thesis_id, name, matchedUser?.id || null);
      }
    }
  }
  res.json({ ok: true, files: savedFiles });
});

// Endpoint para estadísticas del panel de administración
app.get('/admin/stats', authMiddleware, requireRole('admin'), (req, res) => {
  // determine allowed programs for this user (superadmin sees all)
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  let allowedPrograms = null; // null means unrestricted
  if (!roles.includes('superadmin')) {
    allowedPrograms = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(req.user.id).map(r => r.program_id);
    if (allowedPrograms.length === 0) allowedPrograms = ['']; // no match
  }

  // filter clause for allowed programs using thesis_programs join
  let progFilter = '';
  const params = [];
  if (allowedPrograms) {
    if (allowedPrograms.length > 0) {
      progFilter = ` AND EXISTS (SELECT 1 FROM thesis_programs tp WHERE tp.thesis_id = t.id AND tp.program_id IN (${allowedPrograms.map(()=>'?').join(',')}))`;
      params.push(...allowedPrograms);
    } else {
      // no allowed programs, make filter impossible
      progFilter = ' AND 0';
    }
  }

  const totalTheses = db.prepare(`SELECT COUNT(*) as count FROM theses t
                                     WHERE status != 'deleted' ${progFilter}`).get(...params).count;
  const inEvaluation = db.prepare(`SELECT COUNT(*) as count FROM theses t
                                     WHERE status IN ('submitted','revision_minima','revision_cuidados') ${progFilter}`).get(...params).count;
  // consider both possible final statuses (legacy / current)
  const finalized = db.prepare(`SELECT COUNT(*) as count FROM theses t
                                     WHERE status IN ('sustentacion','finalized') ${progFilter}`).get(...params).count;
  const evaluators = db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM user_roles WHERE role = 'evaluator'").get().count;

  // overdue and due soon calculations
  const now = Math.floor(Date.now()/1000);
  const week = now + 7*24*3600;
  const fortnight = now + 15*24*3600;
  const month = now + 30*24*3600;

  const dueRaw = db.prepare(`
    SELECT
      SUM(CASE WHEN te.due_date < ? THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN te.due_date >= ? AND te.due_date < ? THEN 1 ELSE 0 END) as due7,
      SUM(CASE WHEN te.due_date >= ? AND te.due_date < ? THEN 1 ELSE 0 END) as due15,
      SUM(CASE WHEN te.due_date >= ? AND te.due_date < ? THEN 1 ELSE 0 END) as due30
    FROM thesis_evaluators te
    JOIN theses t ON t.id = te.thesis_id
    JOIN thesis_programs tp ON tp.thesis_id = t.id
    WHERE t.status != 'deleted' ${progFilter}
  `).get(now, now, week, week, fortnight, fortnight, month, ...params);

  const overdue = dueRaw.overdue || 0;
  const due7 = dueRaw.due7 || 0;
  const due15 = dueRaw.due15 || 0;
  const due30 = dueRaw.due30 || 0;

  // breakdown by program and status
  const raw = db.prepare(`
    SELECT p.id as program_id, p.name as program_name, t.status, COUNT(*) as count
    FROM theses t
    JOIN thesis_programs tp ON tp.thesis_id = t.id
    JOIN programs p ON p.id = tp.program_id
    WHERE t.status != 'deleted' ${progFilter}
    GROUP BY p.id, p.name, t.status
  `).all(...params);

  // evaluator breakdown: number of assigned theses (in allowed programs) per evaluator
  const evalRaw = db.prepare(`
    SELECT u.id as evaluator_id, u.full_name, COUNT(DISTINCT te.thesis_id) as count
    FROM users u
    JOIN thesis_evaluators te ON te.evaluator_id = u.id
    JOIN theses t ON t.id = te.thesis_id
    JOIN thesis_programs tp ON tp.thesis_id = t.id
    WHERE t.status != 'deleted' ${progFilter}
    GROUP BY u.id, u.full_name
    ORDER BY count DESC
  `).all(...params);
  const evaluatorStats = evalRaw.map(r => ({
    id: r.evaluator_id,
    name: r.full_name,
    theses: r.count,
  }));

  const byProgramMap = {};
  for (const r of raw) {
    if (!byProgramMap[r.program_id]) {
      byProgramMap[r.program_id] = {
        program_id: r.program_id,
        program_name: r.program_name,
        counts: {}
      };
    }
    byProgramMap[r.program_id].counts[r.status] = r.count;
  }
  const byProgram = Object.values(byProgramMap);

  res.json({
    totalTheses,
    inEvaluation,
    finalized,
    evaluators,
    overdue,
    due7,
    due15,
    due30,
    byProgram,
    evaluatorStats
  });
});

// list evaluations with optional due filter for admin pages
app.get('/admin/evaluations', authMiddleware, requireRole('admin'), (req, res) => {
  const { due } = req.query; // overdue,7,15,30
  // reuse allowedPrograms logic from stats
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  let allowedPrograms = null;
  if (!roles.includes('superadmin')) {
    allowedPrograms = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(req.user.id).map(r => r.program_id);
    if (allowedPrograms.length === 0) allowedPrograms = [''];
  }
  let progFilter = '';
  const params = [];
  const now = Math.floor(Date.now()/1000);
  if (allowedPrograms) {
    if (allowedPrograms.length > 0) {
      progFilter = ` AND EXISTS (SELECT 1 FROM thesis_programs tp WHERE tp.thesis_id = t.id AND tp.program_id IN (${allowedPrograms.map(()=>'?').join(',')}))`;
      params.push(...allowedPrograms);
    } else {
      progFilter = ' AND 0';
    }
  }
  // due filter
  let dueClause = '';
  if (due === 'overdue') {
    dueClause = ' AND te.due_date < ?';
    params.push(now);
  } else if (due === '7') {
    dueClause = ' AND te.due_date >= ? AND te.due_date < ?';
    params.push(now, now + 7*24*3600);
  } else if (due === '15') {
    dueClause = ' AND te.due_date >= ? AND te.due_date < ?';
    params.push(now + 7*24*3600, now + 15*24*3600);
  } else if (due === '30') {
    dueClause = ' AND te.due_date >= ? AND te.due_date < ?';
    params.push(now + 15*24*3600, now + 30*24*3600);
  }
  const rows = db.prepare(`
    SELECT te.id as assignment_id, te.thesis_id, t.title as thesis_title,
           te.evaluator_id, u.full_name as evaluator_name,
           te.due_date
    FROM thesis_evaluators te
    JOIN theses t ON t.id = te.thesis_id
    LEFT JOIN users u ON u.id = te.evaluator_id
    WHERE t.status != 'deleted' ${dueClause} ${progFilter}
    ORDER BY te.due_date ASC
  `).all(...params);
  res.json(rows);
});
// Agregar evento al timeline de tesis (admin o evaluador)
app.post('/theses/:id/timeline', authMiddleware, (req, res) => {
  const { event_type, description, completed } = req.body;
  const thesis_id = req.params.id;
  const id = uuidv4();
  const created_at = Math.floor(Date.now() / 1000);
  // Solo admin o evaluador puede agregar eventos
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  if (!roles.includes('admin') && !roles.includes('evaluator')) return res.status(403).json({ error: 'forbidden' });
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, thesis_id, event_type, description || '', completed ? 1 : 0, created_at);
  res.json({ ok: true });
});

// admin feedback endpoint with optional file uploads
app.post('/theses/:id/feedback', authMiddleware, requireRole('admin'), upload.single('file'), (req, res) => {
  const thesis_id = req.params.id;
  const { comment } = req.body;
  const created_at = nowSec();
  const id = uuidv4();
  // add timeline event for feedback
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, thesis_id, 'admin_feedback', comment || 'Comentario del administrador', 0, created_at);
  notifyTimeline(db, thesis_id, 'admin_feedback', comment || 'Comentario del administrador', req.user.id).catch(console.error);
  // store file if present
  if (req.file) {
    const basename = path.basename(req.file.path);
    db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, req.file.originalname, 'admin_feedback', basename, req.user.id);
  }
  res.json({ ok: true });
});

// admin decision (approve to sustentacion or reject)
app.post('/theses/:id/decision', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { action, comment } = req.body;
  const now = nowSec();
  if (action === 'sustentacion') {
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('sustentacion', thesis_id);
    const descSust = 'Tesis aprobada para sustentación' + (comment ? `. ${comment}` : '');
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'admin_decision', descSust, 1, now);
    notifyTimeline(db, thesis_id, 'admin_decision', descSust, req.user.id).catch(console.error);
    return res.json({ ok: true });
  }
  if (action === 'reject') {
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('draft', thesis_id);
    const descRej = 'Tesis devuelta con observaciones del administrador' + (comment ? `. ${comment}` : '');
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'admin_decision', descRej, 1, now);
    notifyTimeline(db, thesis_id, 'admin_decision', descRej, req.user.id).catch(console.error);
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'action must be sustentacion or reject' });
});

// Asignar evaluador a tesis (solo admin) - individual, kept for backward compatibility
app.post('/theses/:id/assign-evaluator', authMiddleware, requireRole('admin'), (req, res) => {
  const { evaluator_id, is_blind, due_date } = req.body;
  const thesis_id = req.params.id;
  // Block director from being evaluator of the same thesis
  const directorNames = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesis_id).map(r => (r.name || '').toUpperCase());
  const evalUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(evaluator_id);
  if (evalUser && directorNames.includes((evalUser.full_name || '').toUpperCase())) {
    return res.status(400).json({ error: `${evalUser.full_name} ya es director(a) de esta tesis y no puede ser evaluador(a) de la misma` });
  }
  const id = uuidv4();
  const dueDateInt = due_date ? Math.floor(Date.parse(due_date) / 1000) || null : null;
  db.prepare('INSERT INTO thesis_evaluators (id, thesis_id, evaluator_id, due_date, is_blind) VALUES (?, ?, ?, ?, ?)')
    .run(id, thesis_id, evaluator_id, dueDateInt, is_blind ? 1 : 0);
  // update status when at least one evaluator assigned; may be called twice
  db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('evaluators_assigned', thesis_id);
  // build a descriptive timeline entry
  let desc;
  if (is_blind) {
    desc = 'Evaluador asignado como par ciego';
  } else {
    const row = db.prepare('SELECT full_name FROM users WHERE id = ?').get(evaluator_id);
    desc = `Evaluador asignado${row && row.full_name ? `: ${row.full_name}` : ''}`;
  }
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'evaluators_assigned', desc, 1, nowSec());
  notifyTimeline(db, thesis_id, 'evaluators_assigned', desc, req.user.id).catch(console.error);
  notifyEvaluatorAssigned(db, thesis_id, evaluator_id, req.user.id).catch(console.error);
  res.json({ ok: true });
});

// Asignar múltiples evaluadores en un solo paso (solo admin)
app.post('/theses/:id/assign-evaluators', authMiddleware, requireRole('admin'), (req, res) => {
  const { evaluator_ids, is_blind, due_date } = req.body;
  const thesis_id = req.params.id;
  if (!Array.isArray(evaluator_ids) || evaluator_ids.length === 0) {
    return res.status(400).json({ error: 'evaluator_ids array required' });
  }
  // Block directors from being evaluators of the same thesis
  const directorNames = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesis_id).map(r => (r.name || '').toUpperCase());
  for (const evId of evaluator_ids) {
    const evalUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(evId);
    if (evalUser && directorNames.includes((evalUser.full_name || '').toUpperCase())) {
      return res.status(400).json({ error: `${evalUser.full_name} ya es director(a) de esta tesis y no puede ser evaluador(a) de la misma` });
    }
  }
  const dueDateInt = due_date ? Math.floor(Date.parse(due_date) / 1000) || null : null;
  const tx = db.transaction(() => {
    for (const ev of evaluator_ids) {
      const id = uuidv4();
      db.prepare('INSERT INTO thesis_evaluators (id, thesis_id, evaluator_id, due_date, is_blind) VALUES (?, ?, ?, ?, ?)')
        .run(id, thesis_id, ev, dueDateInt, is_blind ? 1 : 0);
    }
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('evaluators_assigned', thesis_id);
    // build a description string that includes evaluator names when not blind
    let desc;
    if (is_blind) {
      desc = `${evaluator_ids.length} evaluadores asignados como pares ciegos`;
    } else {
      const placeholders = evaluator_ids.map(() => '?').join(',');
      const rows = db.prepare(`SELECT full_name FROM users WHERE id IN (${placeholders})`).all(...evaluator_ids);
      const names = rows.map(r => r.full_name).filter(Boolean);
      desc = `Evaluadores asignados (${evaluator_ids.length})${names.length ? `: ${names.join(', ')}` : ''}`;
    }
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'evaluators_assigned', desc, 1, nowSec());
  });
  try {
    tx();
    notifyTimeline(db, thesis_id, 'evaluators_assigned', `Evaluadores asignados (${evaluator_ids.length})`, req.user.id).catch(console.error);
    // Notificar a cada evaluador individualmente con sus credenciales
    for (const evId of evaluator_ids) {
      notifyEvaluatorAssigned(db, thesis_id, evId, req.user.id).catch(console.error);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Reemplazar un evaluador por otro (solo si aún no ha enviado evaluación de documento)
app.post('/theses/:id/replace-evaluator', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { old_evaluator_id, new_evaluator_id } = req.body;
  if (!old_evaluator_id || !new_evaluator_id) {
    return res.status(400).json({ error: 'old_evaluator_id y new_evaluator_id son requeridos' });
  }
  // Block director from being evaluator of the same thesis
  const dirNames = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesis_id).map(r => (r.name || '').toUpperCase());
  const newEvalUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(new_evaluator_id);
  if (newEvalUser && dirNames.includes((newEvalUser.full_name || '').toUpperCase())) {
    return res.status(400).json({ error: `${newEvalUser.full_name} ya es director(a) de esta tesis y no puede ser evaluador(a) de la misma` });
  }
  const te = db.prepare('SELECT id, is_blind, due_date FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesis_id, old_evaluator_id);
  if (!te) return res.status(404).json({ error: 'Asignación no encontrada' });
  const started = db.prepare(`
    SELECT 1 FROM evaluations
    WHERE thesis_evaluator_id = ? AND evaluation_type = 'document' AND submitted_at IS NOT NULL
    LIMIT 1
  `).get(te.id);
  if (started) {
    return res.status(400).json({ error: 'El evaluador ya inició la evaluación y no puede ser reemplazado' });
  }
  const alreadyAssigned = db.prepare('SELECT id FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesis_id, new_evaluator_id);
  if (alreadyAssigned) {
    return res.status(400).json({ error: 'El nuevo evaluador ya está asignado a esta tesis' });
  }
  const newEvaluatorRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(new_evaluator_id);
  const oldEvaluatorRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(old_evaluator_id);
  const tx = db.transaction(() => {
    const evalIds = db.prepare('SELECT id FROM evaluations WHERE thesis_evaluator_id = ?').all(te.id).map(r => r.id);
    if (evalIds.length) {
      const ph = evalIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id IN (${ph})`).run(...evalIds);
      db.prepare(`DELETE FROM evaluation_files WHERE evaluation_id IN (${ph})`).run(...evalIds);
      db.prepare(`DELETE FROM evaluations WHERE id IN (${ph})`).run(...evalIds);
    }
    db.prepare('UPDATE thesis_evaluators SET evaluator_id = ? WHERE id = ?').run(new_evaluator_id, te.id);
    const oldName = oldEvaluatorRow?.full_name || old_evaluator_id;
    const newName = newEvaluatorRow?.full_name || new_evaluator_id;
    const desc = `Evaluador reemplazado: ${oldName} por ${newName}`;
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'evaluator_replaced', desc, 1, nowSec());
  });
  try {
    tx();
    const oldName = oldEvaluatorRow?.full_name || old_evaluator_id;
    const newName = newEvaluatorRow?.full_name || new_evaluator_id;
    notifyTimeline(db, thesis_id, 'evaluator_replaced', `Evaluador reemplazado: ${oldName} por ${newName}`, req.user.id).catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Remover un evaluador asignado si aún no ha enviado evaluación de documento
app.delete('/theses/:id/evaluators/:evaluatorId', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const evaluator_id = req.params.evaluatorId;
  const te = db.prepare('SELECT id FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesis_id, evaluator_id);
  if (!te) return res.status(404).json({ error: 'assignment not found' });
  const started = db.prepare(`
    SELECT 1 FROM evaluations
    WHERE thesis_evaluator_id = ? AND evaluation_type = 'document' AND submitted_at IS NOT NULL
    LIMIT 1
  `).get(te.id);
  if (started) {
    return res.status(400).json({ error: 'El evaluador ya inició la evaluación y no puede ser cambiado' });
  }

  const evaluatorRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(evaluator_id);
  const desc = evaluatorRow?.full_name ? `Evaluador retirado de la asignación: ${evaluatorRow.full_name}` : 'Evaluador retirado de la asignación';

  const tx = db.transaction(() => {
    // Remove any partial evaluations and associated data
    const evalIds = db.prepare('SELECT id FROM evaluations WHERE thesis_evaluator_id = ?').all(te.id).map(r => r.id);
    if (evalIds.length) {
      const placeholders = evalIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id IN (${placeholders})`).run(...evalIds);
      db.prepare(`DELETE FROM evaluation_files WHERE evaluation_id IN (${placeholders})`).run(...evalIds);
      db.prepare(`DELETE FROM evaluations WHERE id IN (${placeholders})`).run(...evalIds);
    }
    db.prepare('DELETE FROM thesis_evaluators WHERE id = ?').run(te.id);
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'evaluator_removed', desc, 1, nowSec());
  });

  try {
    tx();
    notifyTimeline(db, thesis_id, 'evaluator_removed', desc, req.user.id).catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Reply to thesis (admin reviews checklist, may send back to student)
app.post('/theses/:id/reply', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { ok, comment } = req.body;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const now = nowSec();
  if (ok) {
    const descOk = comment || 'Documentación revisada y aprobada';
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'review_ok', descOk, 1, now);
    notifyTimeline(db, thesis_id, 'review_ok', descOk, req.user.id).catch(console.error);
  } else {
    db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('draft', thesis_id);
    const descFail = comment || 'Documentación devuelta con observaciones pendientes';
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesis_id, 'review_fail', descFail, 1, now);
    notifyTimeline(db, thesis_id, 'review_fail', descFail, req.user.id).catch(console.error);
  }
  res.json({ ok: true });
});

// Student submits a revision/response to evaluator comments (files + comment)
app.post('/theses/:id/revision', authMiddleware, upload.array('files'), (req, res) => {
  const thesis_id = req.params.id;
  // ensure the user is a student on this thesis
  const isStudent = db.prepare('SELECT 1 FROM thesis_students WHERE thesis_id = ? AND student_id = ?').get(thesis_id, req.user.id);
  if (!isStudent) return res.status(403).json({ error: 'forbidden' });

  const { comment } = req.body;
  const now = nowSec();

  // insert timeline event so evaluators and students see the revision
  // generate event id so uploaded files can reference it
  const eventId = uuidv4();
  const revDesc = comment || 'Revisión enviada por estudiante';
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(eventId, thesis_id, 'revision_submitted', revDesc, 1, now);
  notifyTimeline(db, thesis_id, 'revision_submitted', revDesc, req.user.id).catch(console.error);
  // save uploaded files as thesis_files of type 'revision', link to the timeline event
  const files = req.files || [];
  for (const f of files) {
    const id = uuidv4();
    const basename = path.basename(f.path);
    db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by, timeline_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, thesis_id, f.originalname, 'revision', basename, req.user.id, eventId);
  }

  // update thesis status to 'submitted' and bump revision round so evaluators can re-evaluate
  try {
    db.prepare('UPDATE theses SET status = ?, revision_round = revision_round + 1 WHERE id = ?').run('submitted', thesis_id);
  } catch (err) {
    console.error('Error updating thesis status on revision submit', err);
  }

  res.json({ ok: true });
});

// Asignar estudiante a tesis (solo admin)
app.post('/theses/:id/assign-student', authMiddleware, requireRole('admin'), (req, res) => {
  const { student_id } = req.body;
  const thesis_id = req.params.id;
  const id = uuidv4();
  db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
    .run(id, thesis_id, student_id);
  res.json({ ok: true });
});

// Actualizar tesis (solo admin o creador mientras esté en borrador)
app.put('/theses/:id', authMiddleware, async (req, res) => {
  const { title, abstract, status, companion, program_ids, keywords, director_ids, cvlac } = req.body;
  const thesis_id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  if (thesis.created_by !== req.user.id && !roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // si no es admin, sólo puede editar si está en borrador
  if (!roles.includes('admin') && thesis.status !== 'draft') {
    return res.status(400).json({ error: 'cannot modify after submission' });
  }

  db.prepare('UPDATE theses SET title = ?, abstract = ?, keywords = ?, status = ? WHERE id = ?')
    .run(title || thesis.title, abstract || thesis.abstract, keywords !== undefined ? keywords : thesis.keywords, status || thesis.status, thesis_id);

  if (cvlac !== undefined) db.prepare('UPDATE users SET cvlac = ? WHERE id = ?').run(cvlac || null, req.user.id);

  // companion logic: either update existing or create new when provided
  if (companion) {
    if (!companion.full_name || !companion.student_code || !companion.cedula) {
      return res.status(400).json({ error: 'companion requires full_name, student_code and cedula' });
    }
    // find current companion (student distinto del propio creador)
    const existingComp = db.prepare(
      `SELECT u.id FROM users u
       JOIN thesis_students ts ON u.id = ts.student_id
       WHERE ts.thesis_id = ? AND u.id != ?`
    ).get(thesis_id, req.user.id);
    // ensure no other user has the same code or cedula
    let dup;
    if (existingComp) {
      dup = db.prepare('SELECT id FROM users WHERE (student_code = ? OR cedula = ?) AND id != ? AND id != ?')
        .get(companion.student_code, companion.cedula, existingComp.id, req.user.id);
    } else {
      dup = db.prepare('SELECT id FROM users WHERE (student_code = ? OR cedula = ?) AND id != ?')
        .get(companion.student_code, companion.cedula, req.user.id);
    }
    if (dup) {
      return res.status(400).json({ error: 'companion student_code or cedula already used' });
    }

    try {
      if (existingComp) {
        // update the partner's user record
        let params = [companion.full_name, companion.student_code, companion.cedula || null];
        let sql = 'UPDATE users SET full_name = ?, student_code = ?, cedula = ?';
        // update email too in case code changed
        sql += ', email = ?';
        params.push(companion.student_code + '@estudiante.local');
        if (companion.cvlac !== undefined) { sql += ', cvlac = ?'; params.push(companion.cvlac || null); }
        if (companion.password) {
          const hash = await bcrypt.hash(companion.password, 10);
          sql += ', password_hash = ?';
          params.push(hash);
        }
        sql += ' WHERE id = ?';
        params.push(existingComp.id);
        db.prepare(sql).run(...params);
      } else {
        // create and associate a new companion just like in POST
        const compId = uuidv4();
        const hash = await bcrypt.hash(companion.password || Math.random().toString(36).slice(-8), 10);
        db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(compId,
               companion.student_code + '@estudiante.local',
               hash,
               companion.full_name,
               companion.student_code,
               companion.cedula || null,
               null);
        db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), compId, 'student');
        db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
          .run(uuidv4(), thesis_id, compId);
      }
    } catch (err) {
      // trap unique constraint violations
      if (String(err).includes('UNIQUE')) {
        return res.status(400).json({ error: 'companion student_code or cedula already used' });
      }
      throw err;
    }
  }

  // programs handling
  if (program_ids) {
    // clear existing
    db.prepare('DELETE FROM thesis_programs WHERE thesis_id = ?').run(thesis_id);
    if (Array.isArray(program_ids)) {
      for (const pid of program_ids) {
        db.prepare('INSERT INTO thesis_programs (id, thesis_id, program_id) VALUES (?, ?, ?)')
          .run(uuidv4(), thesis_id, pid);
      }
    }
  }

  // director_ids: replace directors with user-linked entries
  if (director_ids && Array.isArray(director_ids)) {
    db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(thesis_id);
    for (const uid of director_ids) {
      const dirUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(uid);
      if (dirUser) {
        db.prepare('INSERT INTO thesis_directors (id, thesis_id, name, user_id) VALUES (?, ?, ?, ?)')
          .run(uuidv4(), thesis_id, dirUser.full_name, uid);
      }
    }
  }

  res.json({ ok: true });
});

// Administrador o superadmin puede ajustar nota final ponderada tras finalización
app.post('/admin/theses/:id/final-score', authMiddleware, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const { override } = req.body;
  if (override != null && typeof override !== 'number') {
    return res.status(400).json({ error: 'override must be a number or null' });
  }
  const thesis = db.prepare('SELECT status FROM theses WHERE id = ?').get(id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  if (thesis.status !== 'finalized') {
    return res.status(400).json({ error: 'thesis not finalized' });
  }
  db.prepare('UPDATE theses SET final_weighted_override = ? WHERE id = ?').run(override, id);
  res.json({ ok: true });
});

// Enviar tesis a evaluación (solo autor en borrador)
app.put('/theses/:id/submit', authMiddleware, (req, res) => {
  const thesis_id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  if (thesis.created_by !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (thesis.status !== 'draft') return res.status(400).json({ error: 'already submitted' });
  const now = nowSec();
  db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('submitted', thesis_id);
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'submitted', 'Tesis enviada a evaluación', 1, now);
  notifyTimeline(db, thesis_id, 'submitted', 'Tesis enviada a evaluación', null).catch(console.error);
  res.json({ ok: true });
});

// Eliminar tesis (admin o autor en borrador)
app.delete('/theses/:id', authMiddleware, (req, res) => {
  const thesis_id = req.params.id;
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  console.log('delete attempt by', req.user && req.user.id, 'thesis', thesis);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  console.log('roles for user', roles);
  if (roles.includes('admin') || roles.includes('superadmin') || (thesis.created_by === req.user.id && thesis.status === 'draft')) {
    // if an admin and there are already evaluations, perform soft delete
    const evCount = db.prepare(
      `SELECT COUNT(*) as c FROM evaluations e
       JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
       WHERE te.thesis_id = ?`
    ).get(thesis_id).c;
    if (evCount > 0 && roles.includes('admin')) {
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('deleted', thesis_id);
      return res.json({ ok: true, soft: true });
    }
    // Identificar compañeros para eliminarlos junto con la tesis
    // Son estudiantes vinculados que NO crearon la tesis y NO tienen otra tesis activa
    const companionIds = db.prepare(`
      SELECT ts.student_id FROM thesis_students ts
      WHERE ts.thesis_id = ? AND ts.student_id != ?
        AND NOT EXISTS (
          SELECT 1 FROM thesis_students ts2
          JOIN theses t2 ON t2.id = ts2.thesis_id
          WHERE ts2.student_id = ts.student_id AND ts2.thesis_id != ? AND t2.status != 'deleted'
        )
    `).all(thesis_id, thesis.created_by, thesis_id).map(r => r.student_id);

    // temporalmente desactivar comprobación de claves foráneas
    db.pragma('foreign_keys = OFF');
    try {
      // limpiar tablas relacionadas para evitar violaciones de FK
      let r;
    r = db.prepare('DELETE FROM thesis_files WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_files', r.changes);
    r = db.prepare('DELETE FROM thesis_timeline WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_timeline', r.changes);
    r = db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_directors', r.changes);
    r = db.prepare('DELETE FROM thesis_students WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_students', r.changes);
    // primero borrar evaluaciones y sus archivos/puntajes, porque referencian
    // thesis_evaluators. usamos subconsultas simples con IN para evitar joins
    r = db.prepare(
      `DELETE FROM evaluation_files WHERE evaluation_id IN (
         SELECT id FROM evaluations WHERE thesis_evaluator_id IN (
            SELECT id FROM thesis_evaluators WHERE thesis_id = ?
         )
       )`
    ).run(thesis_id);
    console.log('deleted evaluation_files', r.changes);
    r = db.prepare(
      `DELETE FROM evaluation_scores WHERE evaluation_id IN (
         SELECT id FROM evaluations WHERE thesis_evaluator_id IN (
            SELECT id FROM thesis_evaluators WHERE thesis_id = ?
         )
       )`
    ).run(thesis_id);
    console.log('deleted evaluation_scores', r.changes);
    r = db.prepare(
      `DELETE FROM evaluations WHERE thesis_evaluator_id IN (
         SELECT id FROM thesis_evaluators WHERE thesis_id = ?
       )`
    ).run(thesis_id);
    console.log('deleted evaluations', r.changes);
    // luego sí eliminar asignaciones
    r = db.prepare('DELETE FROM thesis_evaluators WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_evaluators', r.changes);
    // eliminar vínculos programa
    r = db.prepare('DELETE FROM thesis_programs WHERE thesis_id = ?').run(thesis_id);
    console.log('deleted thesis_programs', r.changes);
    // eliminar usuarios compañeros huérfanos
    for (const compId of companionIds) {
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(compId);
      db.prepare('DELETE FROM profiles WHERE id = ?').run(compId);
      db.prepare('DELETE FROM users WHERE id = ?').run(compId);
      console.log('deleted companion user', compId);
    }
    r = db.prepare('DELETE FROM theses WHERE id = ?').run(thesis_id);
    console.log('deleted thesis record', r.changes);
    return res.json({ ok: true });
  } finally {
    // restore FK enforcement
    db.pragma('foreign_keys = ON');
  }
  }
  console.log('delete forbidden');
  res.status(403).json({ error: 'forbidden' });
});

// Listar evaluaciones por tesis
app.get('/theses/:id/evaluations', authMiddleware, (req, res) => {
  const thesis_id = req.params.id;
  const rows = db.prepare(`
    SELECT e.*, te.evaluator_id, te.thesis_id, u.full_name as evaluator_name
    FROM evaluations e
    JOIN thesis_evaluators te ON e.thesis_evaluator_id = te.id
    LEFT JOIN users u ON te.evaluator_id = u.id
    WHERE te.thesis_id = ?
    ORDER BY e.created_at ASC
  `).all(thesis_id);
  res.json(rows);
});

// Listar evaluaciones por evaluador
// GET /evaluations/rubric-xlsx?thesis_id=X&evaluation_type=Y — evaluador descarga su rúbrica (pre-llenada si ya evaluó)
app.get('/evaluations/rubric-xlsx', authMiddleware, requireRole('evaluator'), async (req, res) => {
  const { thesis_id, evaluation_type } = req.query;
  if (!thesis_id || !evaluation_type) return res.status(400).json({ error: 'thesis_id y evaluation_type son requeridos' });

  // Obtener tesis y programa
  const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(thesis_id);
  if (!thesis) return res.status(404).json({ error: 'Tesis no encontrada' });

  // Verificar que el evaluador esté asignado a esta tesis
  const assignment = db.prepare('SELECT id FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesis_id, req.user.id);
  if (!assignment) return res.status(403).json({ error: 'No tiene acceso a esta tesis' });

  const program = db.prepare('SELECT name FROM programs WHERE id = ?').get(thesis.program_id);
  const rubric = db.prepare('SELECT * FROM program_rubrics WHERE program_id = ? AND evaluation_type = ?').get(thesis.program_id, evaluation_type);
  if (!rubric) return res.status(404).json({ error: 'Rúbrica no encontrada para este programa' });

  // Buscar evaluación existente del evaluador para esta tesis/tipo (ronda actual)
  const currentRound = thesis.revision_round || 0;
  const existingEval = db.prepare(`
    SELECT e.* FROM evaluations e
    JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
    WHERE te.thesis_id = ? AND te.evaluator_id = ? AND e.evaluation_type = ? AND e.revision_round = ?
    ORDER BY e.submitted_at DESC LIMIT 1
  `).get(thesis_id, req.user.id, evaluation_type, currentRound);

  // Cargar puntajes si existe evaluación
  let scores = [];
  if (existingEval) {
    scores = db.prepare('SELECT section_id, criterion_id, score, observations FROM evaluation_scores WHERE evaluation_id = ?').all(existingEval.id);
  }

  try {
    const ExcelJS = require('exceljs');
    const sections = JSON.parse(rubric.sections_json);
    const typeLabel = evaluation_type === 'document' ? 'Documento' : 'Sustentación';
    const programName = program ? program.name : 'Programa';
    const isFilled = scores.length > 0;

    const COLOR = {
      titleBg: '1E3A5F', titleFg: 'FFFFFF',
      headerBg: '2E75B6', headerFg: 'FFFFFF',
      sectionColors: ['D6E4F0', 'D5E8D4', 'FFE6CC', 'E1D5E7', 'DAE8FC'],
      sectionFg: '1E3A5F',
      criterionAlt: 'F0F7FF',
      inputBg: 'FFFDE7',
      filledBg: 'E8F5E9',
      subtotalBg: 'E2EFDA', subtotalFg: '375623',
      totalBg: '375623', totalFg: 'FFFFFF',
      border: 'B0BEC5',
    };

    const font  = (bold = false, size = 11, color = '000000') => ({ name: 'Calibri', bold, size, color: { argb: 'FF' + color } });
    const fill  = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
    const bdr   = (hex = COLOR.border) => { const s = { style: 'thin', color: { argb: 'FF' + hex } }; return { top: s, left: s, bottom: s, right: s }; };
    const align = (h = 'left', v = 'middle', wrap = false) => ({ horizontal: h, vertical: v, wrapText: wrap });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SisTesis';
    const ws = wb.addWorksheet(`Rúbrica ${typeLabel}`.substring(0, 31), {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    ws.columns = [
      { width: 28 }, { width: 10 }, { width: 8 },
      { width: 42 }, { width: 16 }, { width: 18 }, { width: 20 },
    ];

    // Título
    const tRow = ws.addRow([`RÚBRICA DE EVALUACIÓN — ${typeLabel.toUpperCase()}`, '', '', '', '', '', '']);
    ws.mergeCells(1, 1, 1, 7); tRow.height = 32;
    Object.assign(tRow.getCell(1), { font: font(true, 14, COLOR.titleFg), fill: fill(COLOR.titleBg), alignment: align('center'), border: bdr() });

    // Programa
    const pRow = ws.addRow([programName, '', '', '', '', '', '']);
    ws.mergeCells(2, 1, 2, 7); pRow.height = 20;
    Object.assign(pRow.getCell(1), { font: font(false, 11, COLOR.titleFg), fill: fill(COLOR.titleBg), alignment: align('center'), border: bdr() });

    // Tesis
    const thesisRow = ws.addRow([`Tesis: ${thesis.title || ''}`, '', '', '', '', '', '']);
    ws.mergeCells(3, 1, 3, 7); thesisRow.height = 18;
    Object.assign(thesisRow.getCell(1), { font: font(false, 10, COLOR.titleFg), fill: fill('2E5080'), alignment: align('left', 'middle', true), border: bdr() });

    // Estado
    const estadoRow = ws.addRow([isFilled ? '✅ Evaluación enviada — puntajes cargados automáticamente' : '⚠️ Evaluación pendiente — complete la columna amarilla', '', '', '', '', '', '']);
    ws.mergeCells(4, 1, 4, 7); estadoRow.height = 18;
    const estadoCell = estadoRow.getCell(1);
    estadoCell.font = { name: 'Calibri', italic: true, size: 10, color: { argb: isFilled ? 'FF375623' : 'FF8B5E00' } };
    estadoCell.fill = fill(isFilled ? 'E2EFDA' : 'FFF8E1');
    estadoCell.alignment = align('center', 'middle');
    estadoCell.border = bdr();

    // Encabezados
    const hRow = ws.addRow(['Sección', 'Peso (%)', 'Criterios', 'Criterio de Evaluación', 'Puntaje Máximo', 'Puntaje Obtenido', 'Aporte Ponderado']);
    hRow.height = 28;
    hRow.eachCell(c => Object.assign(c, { font: font(true, 11, COLOR.headerFg), fill: fill(COLOR.headerBg), alignment: align('center', 'middle', true), border: bdr() }));

    let currentRow = 6;
    const sectionSubtotalRefs = [];

    sections.forEach((section, sIdx) => {
      const count = section.criteria.length;
      const secStart = currentRow;
      const secBg = COLOR.sectionColors[sIdx % COLOR.sectionColors.length];

      section.criteria.forEach((criterion, cIdx) => {
        const er = currentRow;
        const existingScore = scores.find(sc => sc.section_id === section.id && sc.criterion_id === criterion.id);
        const scoreValue = existingScore ? existingScore.score : null;
        const obsValue = existingScore ? existingScore.observations : '';

        const row = ws.addRow([
          cIdx === 0 ? section.name : '',
          cIdx === 0 ? section.weight : '',
          cIdx === 0 ? count : '',
          criterion.name,
          criterion.maxScore,
          scoreValue,
          null,
        ]);
        row.height = 22;

        Object.assign(row.getCell(1), { font: font(true, 11, COLOR.sectionFg), fill: fill(secBg), alignment: align('center', 'middle', true), border: bdr() });
        Object.assign(row.getCell(2), { font: font(true, 11, COLOR.sectionFg), fill: fill(secBg), alignment: align('center', 'middle'), numFmt: '0"%"', border: bdr() });
        Object.assign(row.getCell(3), { font: font(false, 10, '555555'), fill: fill(secBg), alignment: align('center', 'middle'), border: bdr() });

        const critBg = cIdx % 2 === 0 ? 'FFFFFF' : COLOR.criterionAlt;
        Object.assign(row.getCell(4), { font: font(false, 11), fill: fill(critBg), alignment: align('left', 'middle', true), border: bdr() });
        Object.assign(row.getCell(5), { font: font(false, 11, '444444'), fill: fill(critBg), alignment: align('center', 'middle'), border: bdr() });

        // Columna F: verde si ya tiene puntaje, amarillo si no
        const cF = row.getCell(6);
        cF.fill = fill(scoreValue !== null ? COLOR.filledBg : COLOR.inputBg);
        cF.alignment = align('center', 'middle');
        cF.border = bdr(scoreValue !== null ? '375623' : 'FFBB00');
        cF.font = font(scoreValue !== null, 11, scoreValue !== null ? '375623' : '333333');
        if (!isFilled) cF.note = `Ingrese el puntaje obtenido (0 – ${criterion.maxScore})`;

        // Columna G: fórmula aporte
        const cG = row.getCell(7);
        cG.value = { formula: `IFERROR((F${er}/E${er})*(B${secStart}/C${secStart}),0)` };
        cG.numFmt = '0.00';
        Object.assign(cG, { font: font(false, 11, COLOR.sectionFg), fill: fill(critBg), alignment: align('center', 'middle'), border: bdr() });

        // Fila observación si existe
        if (isFilled && obsValue) {
          currentRow++;
          const obsRow = ws.addRow(['', '', '', `  ↳ Obs: ${obsValue}`, '', '', '']);
          obsRow.height = 16;
          Object.assign(obsRow.getCell(4), { font: { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF666666' } }, fill: fill('FAFAFA'), alignment: align('left', 'middle', true), border: bdr() });
          [1,2,3,5,6,7].forEach(col => { obsRow.getCell(col).fill = fill('FAFAFA'); obsRow.getCell(col).border = bdr(); });
        }

        currentRow++;
      });

      if (count > 1) {
        ws.mergeCells(secStart, 1, secStart + count - 1, 1);
        ws.mergeCells(secStart, 2, secStart + count - 1, 2);
        ws.mergeCells(secStart, 3, secStart + count - 1, 3);
      }

      // Subtotal sección
      const stRow = ws.addRow(['', '', '', `Subtotal — ${section.name}`, '', '', null]);
      stRow.height = 20;
      stRow.getCell(7).value = { formula: `SUM(G${secStart}:G${currentRow - 1})` };
      stRow.getCell(7).numFmt = '0.00';
      sectionSubtotalRefs.push(`G${currentRow}`);
      [1,2,3,4,5,6,7].forEach(col => Object.assign(stRow.getCell(col), { font: font(col === 4, 11, COLOR.subtotalFg), fill: fill(COLOR.subtotalBg), alignment: align(col === 4 ? 'right' : 'center', 'middle'), border: bdr() }));
      currentRow++;

      ws.addRow([]).height = 5;
      currentRow++;
    });

    // Nota final
    const finalRow = ws.addRow(['', '', '', '', '', 'NOTA FINAL  (0.0 – 5.0)', null]);
    finalRow.height = 30;
    finalRow.getCell(7).value = { formula: `(${sectionSubtotalRefs.join('+')})/100*5` };
    finalRow.getCell(7).numFmt = '0.0"  / 5.0"';
    [1,2,3,4,5,6,7].forEach(col => Object.assign(finalRow.getCell(col), { font: font(true, 13, COLOR.totalFg), fill: fill(COLOR.totalBg), alignment: align(col === 6 ? 'right' : 'center', 'middle'), border: bdr() }));

    // Observaciones generales
    if (isFilled && existingEval.general_observations) {
      ws.addRow([]).height = 8;
      const goTitle = ws.addRow(['Observaciones Generales', '', '', '', '', '', '']);
      ws.mergeCells(goTitle.number, 1, goTitle.number, 7);
      Object.assign(goTitle.getCell(1), { font: font(true, 11, COLOR.headerFg), fill: fill(COLOR.headerBg), alignment: align('left', 'middle'), border: bdr() });
      const goRow = ws.addRow([existingEval.general_observations, '', '', '', '', '', '']);
      ws.mergeCells(goRow.number, 1, goRow.number, 7);
      goRow.height = 40;
      Object.assign(goRow.getCell(1), { font: font(false, 10), fill: fill('F9F9F9'), alignment: align('left', 'middle', true), border: bdr() });
    }

    // Pie
    ws.addRow([]).height = 8;
    const instr = ws.addRow([isFilled ? '* Puntajes cargados desde la evaluación enviada. Los aportes se calculan automáticamente.' : '* Complete únicamente la columna "Puntaje Obtenido" (celdas en amarillo).']);
    ws.mergeCells(instr.number, 1, instr.number, 7);
    instr.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF777777' } };

    const filename = `Rubrica_${typeLabel}_${(thesis.title || 'Tesis').replace(/\s+/g, '_').substring(0, 40)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Error generando XLSX evaluador:', err);
    res.status(500).json({ error: 'Error generando el archivo' });
  }
});

app.get('/evaluators/:id/evaluations', authMiddleware, requireRole('evaluator'), (req, res) => {
  const evaluator_id = req.params.id;
  if (evaluator_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const rows = db.prepare(
    `SELECT e.* FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.evaluator_id = ?`
  ).all(evaluator_id);
  res.json(rows);
});

// Timeline de tesis (eventos)
app.get('/theses/:id/timeline', authMiddleware, (req, res) => {
  // Suponiendo que hay una tabla thesis_timeline (debería agregarse al esquema si no existe)
  const thesis_id = req.params.id;
  const rows = db.prepare('SELECT * FROM thesis_timeline WHERE thesis_id = ? ORDER BY created_at ASC').all(thesis_id);
  res.json(rows);
});
// Registrar evaluador o staff (solo admin)
app.post('/users/register', authMiddleware, requireRole('admin'), [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una letra minúscula, una mayúscula y un número'),
  body('full_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre completo debe tener entre 2 y 100 caracteres'),
  body('role')
    .isIn(['student', 'evaluator', 'admin'])
    .withMessage('Rol inválido'),
  body('student_code')
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage('Código de estudiante inválido'),
  body('cedula')
    .optional()
    .isLength({ min: 5, max: 15 })
    .matches(/^\d+$/)
    .withMessage('Cédula debe contener solo números'),
  body('institutional_email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email institucional inválido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Datos de entrada inválidos', 
      details: errors.array() 
    });
  }

  const { email, password, full_name, role, specialty, student_code, cedula, institutional_email } = req.body;
  
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, email, password_hash, full_name, student_code || null, cedula || null, institutional_email || email);
    
    db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), id, role);
    
    // Crear perfil básico
    db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, institutional_email, student_code, cedula, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, full_name, institutional_email || email, student_code || null, cedula || null, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    
    // Si es evaluador, guardar especialidad
    if (role === 'evaluator' && specialty) {
      db.prepare('UPDATE profiles SET specialty = ? WHERE id = ?').run(specialty, id);
    }
    
    const user = db.prepare('SELECT id, email, full_name, institutional_email FROM users WHERE id = ?').get(id);
    res.json({ user });
  } catch (err) {
    console.error('Error en registro de usuario:', err);
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Listar usuarios (solo admin). Puede filtrar por ?role=evaluator etc.
app.get('/users', authMiddleware, requireRole('admin'), (req, res) => {
  const { role } = req.query;
  // First get all distinct users with their roles
  let sql = `SELECT u.id, u.institutional_email, u.full_name, r.role
             FROM users u
             LEFT JOIN user_roles r ON u.id = r.user_id`;
  const params = [];
  if (role) {
    sql += ' WHERE r.role = ?';
    params.push(role);
  }
  const rows = db.prepare(sql).all(...params);
  
  // Aggregate by user and count distinct theses evaluated
  const map = {};
  for (const r of rows) {
    if (!map[r.id]) {
      // Count distinct theses this evaluator has evaluated
      const countResult = db.prepare(`
        SELECT COUNT(DISTINCT t.id) as count
        FROM thesis_evaluators te
        LEFT JOIN theses t ON te.thesis_id = t.id
        WHERE te.evaluator_id = ? AND (t.id IS NULL OR t.status != 'deleted')
      `).get(r.id);
      
      map[r.id] = {
        id: r.id,
        institutional_email: r.institutional_email,
        full_name: r.full_name,
        roles: [],
        theses: countResult.count || 0,
      };
    }
    if (r.role) map[r.id].roles.push(r.role);
  }
  res.json(Object.values(map));
});

// Get theses evaluated by a specific evaluator
app.get('/evaluator/:id/evaluated-theses', authMiddleware, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status, te.assigned_at, te.due_date, te.is_blind, 
           GROUP_CONCAT(u.full_name, ', ') as student_names
    FROM thesis_evaluators te
    JOIN theses t ON te.thesis_id = t.id
    LEFT JOIN thesis_students ts ON t.id = ts.thesis_id
    LEFT JOIN users u ON ts.student_id = u.id
    WHERE te.evaluator_id = ? AND t.status != 'deleted'
    GROUP BY t.id, te.id
    ORDER BY te.assigned_at DESC
  `).all(id);
  res.json(rows || []);
});

// Editar usuario (solo admin)
app.put('/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  let { full_name, email, student_code, cedula, institutional_email, password } = req.body;
  const { id } = req.params;
  // Convertir nombre a mayúsculas
  if (full_name) full_name = full_name.toUpperCase();
  try {
    // check uniqueness if provided
    if (student_code) {
      const dup = db.prepare('SELECT id FROM users WHERE student_code = ? AND id != ?').get(student_code, id);
      if (dup) return res.status(400).json({ error: 'student_code already in use' });
    }
    if (cedula) {
      const dup = db.prepare('SELECT id FROM users WHERE cedula = ? AND id != ?').get(cedula, id);
      if (dup) return res.status(400).json({ error: 'cedula already in use' });
    }
    db.prepare('UPDATE users SET full_name = ?, email = ?, student_code = ?, cedula = ?, institutional_email = ? WHERE id = ?')
      .run(full_name, email, student_code || null, cedula || null, institutional_email || null, id);
    // Sync director name in thesis_directors
    if (full_name) {
      db.prepare('UPDATE thesis_directors SET name = ? WHERE user_id = ?').run(full_name, id);
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    }
    res.json({ ok: true });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) {
      return res.status(400).json({ error: 'email, student_code or cedula already used' });
    }
    res.status(500).json({ error: msg });
  }
});

// Enviar credenciales de acceso a un usuario (genera nueva contraseña y envía email)
app.post('/users/:id/send-credentials', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT id, full_name, institutional_email, cedula FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!user.institutional_email) return res.status(400).json({ error: 'El usuario no tiene correo institucional' });

  if (!user.cedula) return res.status(400).json({ error: 'El usuario no tiene cédula registrada' });
  const firstName = (user.full_name || '').split(' ')[0].toLowerCase();
  const password = firstName + user.cedula;

  // Actualizar el hash en la BD para que coincida con la contraseña enviada
  const newHash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, id);

  const sent = await sendWelcomeEmail(db, user.institutional_email, user.full_name, user.institutional_email, password, req.user.id);
  if (!sent) return res.status(500).json({ error: 'No se pudo enviar el correo. Verifica la configuración SMTP.' });
  res.json({ ok: true });
});

// Eliminar usuario (solo admin). limpiamos datos asociados para evitar violaciones de fk
app.delete('/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const tx = db.transaction(() => {
    // roles y enlaces with tesis
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id);

    // remove any notifications (FK -> users)
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);

    // remove any smtp config, signatures, and program admin links
    db.prepare('DELETE FROM smtp_config WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM acta_signatures WHERE signer_user_id = ?').run(id);
    db.prepare('DELETE FROM digital_signatures WHERE signer_user_id = ?').run(id);
    db.prepare('DELETE FROM program_admins WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM programs WHERE admin_user_id = ?').run(id);

    // if user is a student, unlink from thesis_students
    db.prepare('DELETE FROM thesis_students WHERE student_id = ?').run(id);

    // evaluador: primero borramos evaluaciones y sus artefactos, luego la asignación
    // para evitar violaciones de foreign key.
    db.prepare(`DELETE FROM evaluation_files WHERE evaluation_id IN (
         SELECT e.id FROM evaluations e
         JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
         WHERE te.evaluator_id = ?
       )`).run(id);
    db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id IN (
         SELECT e.id FROM evaluations e
         JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
         WHERE te.evaluator_id = ?
       )`).run(id);
    db.prepare(`DELETE FROM evaluations WHERE thesis_evaluator_id IN (
         SELECT id FROM thesis_evaluators WHERE evaluator_id = ?
       )`).run(id);
    db.prepare('DELETE FROM thesis_evaluators WHERE evaluator_id = ?').run(id);

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Cambiar contraseña (usuario autenticado)
app.post('/auth/change-password', authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'old_password y new_password requeridos' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const ok = await bcrypt.compare(old_password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const password_hash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
// ...existing code...

function signToken(user) {
  // include institutional_email for clarity
  return jwt.sign({ id: user.id, institutional_email: user.institutional_email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'invalid token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const rows = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id);
    const roles = rows.map(r => r.role);
    // superadmin bypasses any role requirement
    if (!roles.includes(role) && !roles.includes('superadmin')) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

app.post('/auth/register', async (req, res) => {
  // students register using their institutional email; password is auto-generated if not provided
  let { institutional_email, full_name, student_code, cedula } = req.body;
  let { password } = req.body;
  if (!institutional_email) return res.status(400).json({ error: 'institutional_email required' });
  // Convertir nombre a mayúsculas
  if (full_name) full_name = full_name.toUpperCase();
  // auto-generate password if not provided (sent by email)
  const autoPassword = !password;
  if (autoPassword) {
    const firstName = (full_name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario';
    password = `${firstName}_${cedula || Math.random().toString(36).slice(-6)}`;
  }
  // uniqueness checks
  const existsMail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
  if (existsMail) return res.status(400).json({ error: 'institutional_email already in use' });
  if (student_code) {
    const exists = db.prepare('SELECT id FROM users WHERE student_code = ?').get(student_code);
    if (exists) return res.status(400).json({ error: 'student_code already in use' });
  }
  if (cedula) {
    const exists = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (exists) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, institutional_email, password_hash, full_name || null, student_code || null, cedula || null, institutional_email || null);

    // assign student role by default
    db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), id, 'student');

    const user = db.prepare('SELECT id, email, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(id);
    const token = signToken(user);
    // Enviar contraseña por email si fue auto-generada
    if (autoPassword) {
      sendWelcomeEmail(db, institutional_email, full_name || '', institutional_email, password, null).catch(console.error);
    }
    res.json({ user, token });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE') && msg.includes('users')) {
      return res.status(400).json({ error: 'institutional_email, student_code or cedula already used' });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/auth/login', authLimiter, [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Identificador requerido')
    .isLength({ max: 100 })
    .withMessage('Identificador demasiado largo'),
  body('password')
    .notEmpty()
    .withMessage('Contraseña requerida')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Datos de entrada inválidos', 
      details: errors.array() 
    });
  }

  // allow login by institucional email, student_code or cedula
  let { identifier, password } = req.body;
  
  try {
    const identifierUpper = identifier.toUpperCase();
    let user = db.prepare('SELECT id, email, password_hash, full_name, student_code, cedula, institutional_email FROM users WHERE UPPER(institutional_email) = ?').get(identifierUpper);
    if (!user && typeof identifier === 'string' && !identifier.includes('@')) {
      // try student_code
      user = db.prepare('SELECT id, email, password_hash, full_name, student_code, cedula, institutional_email FROM users WHERE student_code = ?').get(identifier);
    }
    if (!user && typeof identifier === 'string' && !identifier.includes('@')) {
      // try cedula
      user = db.prepare('SELECT id, email, password_hash, full_name, student_code, cedula, institutional_email FROM users WHERE cedula = ?').get(identifier);
    }
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    delete user.password_hash;
    // hide generic email field, rely on institutional_email instead
    delete user.email;
    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/auth/logout', (req, res) => {
  // With JWT we rely on client to discard token; implement blacklist if needed
  res.json({ ok: true });
});

app.get('/auth/session', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!token) return res.json({ session: null });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.json({ session: null });
    return res.json({ session: { user } });
  } catch (err) {
    return res.json({ session: null });
  }
});

app.get('/profiles/:id', (req, res) => {
  const id = req.params.id;
  const profile = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(id);
  if (!profile) return res.status(404).json({ error: 'not found' });
  res.json(profile);
});

app.get('/user_roles', (req, res) => {
  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const rows = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(user_id);
  res.json(rows.map(r => r.role));
});

// Programs API (categorías creadas por admin)
// This endpoint is intentionally public so the landing page can show reception windows
// without requiring users to be logged in.
app.get('/programs', (req, res) => {
  // Determine if caller is admin/superadmin to decide whether to include hidden programs
  let isAdmin = false;
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ebbc1015f164c3b46f50de43732395eed6d9fee8468d36b57bcd9e755911b626830a851fc20e8119d958a964ef918005416f9ef8c8c58068ea94b7d1629c67b4');
      const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(decoded.id).map(r => r.role);
      isAdmin = roles.includes('admin') || roles.includes('superadmin');
    }
  } catch {}

  const rows = db.prepare(
    `SELECT p.id, p.name, p.reception_start, p.reception_end, p.max_evaluators, p.hidden,
            GROUP_CONCAT(pa.user_id) as admin_user_ids
     FROM programs p
     LEFT JOIN program_admins pa ON pa.program_id = p.id
     WHERE (p.hidden = 0 OR p.hidden IS NULL OR ? = 1)
     GROUP BY p.id, p.name, p.reception_start, p.reception_end, p.max_evaluators, p.hidden
     ORDER BY p.name`
  ).all(isAdmin ? 1 : 0);

  const data = rows
    .map(r => ({
      id: r.id,
      name: r.name,
      reception_start: r.reception_start ? new Date(r.reception_start).toISOString().slice(0,10) : null,
      reception_end: r.reception_end ? new Date(r.reception_end).toISOString().slice(0,10) : null,
      max_evaluators: r.max_evaluators ?? 2,
      hidden: !!r.hidden,
      admin_user_ids: r.admin_user_ids ? r.admin_user_ids.split(',') : []
    }));
  res.json(data);
});

// toggle visibilidad de un programa
app.patch('/programs/:id/toggle-hidden', authMiddleware, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const prog = db.prepare('SELECT id, hidden FROM programs WHERE id = ?').get(id);
  if (!prog) return res.status(404).json({ error: 'not found' });
  const newHidden = prog.hidden ? 0 : 1;
  db.prepare('UPDATE programs SET hidden = ? WHERE id = ?').run(newHidden, id);
  res.json({ id, hidden: !!newHidden });
});

// List users with evaluator role — used by student thesis registration to pick directors.
// Requires auth but not admin role (students call this).
app.get('/evaluators', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.institutional_email
    FROM users u
    JOIN user_roles r ON u.id = r.user_id
    WHERE r.role = 'evaluator'
    ORDER BY u.full_name
  `).all();
  res.json(rows);
});

app.post('/programs', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, admin_user_id, admin_user_ids, reception_start, reception_end } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  try {
    const startTs = reception_start ? Date.parse(reception_start) : null;
    const endTs = reception_end ? Date.parse(reception_end) : null;
    // keep legacy column but we will also populate program_admins
    db.prepare('INSERT INTO programs (id, name, admin_user_id, reception_start, reception_end) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, admin_user_id || null, startTs, endTs);
    const usedIds = Array.isArray(admin_user_ids) ? admin_user_ids : (admin_user_id ? [admin_user_id] : []);
    for (const uid of usedIds) {
      db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
        .run(uuidv4(), id, uid);
    }
    res.json({ id, name, reception_start, reception_end, admin_user_ids: usedIds });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// editar un programa existente
app.put('/programs/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const { name, admin_user_id, admin_user_ids, reception_start, reception_end } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const existing = db.prepare('SELECT id FROM programs WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const startTs = reception_start ? Date.parse(reception_start) : null;
    const endTs = reception_end ? Date.parse(reception_end) : null;
    db.prepare('UPDATE programs SET name = ?, admin_user_id = ?, reception_start = ?, reception_end = ? WHERE id = ?')
      .run(name, admin_user_id || null, startTs, endTs, id);
    // update join table if list provided
    if (admin_user_ids) {
      db.prepare('DELETE FROM program_admins WHERE program_id = ?').run(id);
      for (const uid of admin_user_ids) {
        db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
          .run(uuidv4(), id, uid);
      }
    }
    const usedIds = Array.isArray(admin_user_ids) ? admin_user_ids : (admin_user_id ? [admin_user_id] : []);
    res.json({ id, name, reception_start, reception_end, admin_user_ids: usedIds });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// eliminar un programa y sus relaciones
app.delete('/programs/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const id = req.params.id;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM thesis_programs WHERE program_id = ?').run(id);
    db.prepare('DELETE FROM program_admins WHERE program_id = ?').run(id);
    db.prepare('DELETE FROM programs WHERE id = ?').run(id);
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Superadmin-only user management
app.get('/super/users', authMiddleware, requireRole('superadmin'), (req, res) => {
  const rows = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users').all();
  const users = rows.map(u => {
    const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(u.id).map(r => r.role);
    const programs = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(u.id).map(r => r.program_id);
    return { ...u, roles, program_ids: programs };
  });
  res.json(users);
});

// Superadmin review checklist configuration
// both admins and superadmins can read the checklist template
app.get('/super/review-items', authMiddleware, (req, res) => {
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const items = db.prepare('SELECT id, label, sort_order FROM review_items WHERE program_id IS NULL ORDER BY sort_order').all();
  res.json(items);
});

// weights configuration for document vs presentation
app.get('/super/weights', authMiddleware, (req, res) => {
  // allow any authenticated user to read weights
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!roles.includes('admin') && !roles.includes('superadmin') && !roles.includes('evaluator') && !roles.includes('student')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?,?)').all('doc_weight','presentation_weight');
  const result = { doc: 70, presentation: 30 };
  rows.forEach(r => {
    if (r.key === 'doc_weight') result.doc = Number(r.value);
    if (r.key === 'presentation_weight') result.presentation = Number(r.value);
  });
  res.json(result);
});
app.post('/super/weights', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { doc, presentation } = req.body;
  if (doc == null || presentation == null) return res.status(400).json({ error: 'missing weights' });
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('doc_weight', String(doc));
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('presentation_weight', String(presentation));
  res.json({ doc, presentation });
});
app.post('/super/review-items', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { label, sort_order } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const id = uuidv4();
  db.prepare('INSERT INTO review_items (id, label, sort_order) VALUES (?, ?, ?)').run(id, label, sort_order || 0);
  res.json({ id, label, sort_order: sort_order||0 });
});
app.put('/super/review-items/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { id } = req.params;
  const { label, sort_order } = req.body;
  const updates = [];
  const params = [];
  if (label !== undefined) { updates.push('label = ?'); params.push(label); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (updates.length === 0) return res.status(400).json({ error: 'nothing to update' });
  params.push(id);
  db.prepare(`UPDATE review_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const item = db.prepare('SELECT id, label, sort_order FROM review_items WHERE id = ?').get(id);
  res.json(item);
});
app.delete('/super/review-items/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM review_items WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── Reglas de notificación configurables (superadmin) ──────────────────────
app.get('/super/notification-rules', authMiddleware, requireRole('superadmin'), (req, res) => {
  const rules = db.prepare('SELECT event_type, role, enabled FROM notification_rules ORDER BY event_type, role').all();
  res.json(rules);
});

app.put('/super/notification-rules', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules array required' });
  const upsert = db.prepare('INSERT INTO notification_rules (event_type, role, enabled) VALUES (?, ?, ?) ON CONFLICT(event_type, role) DO UPDATE SET enabled = excluded.enabled');
  const tx = db.transaction((rows) => { for (const r of rows) upsert.run(r.event_type, r.role, r.enabled ? 1 : 0); });
  try { tx(rules); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Plantillas de notificación configurables (superadmin) ───────────────────
app.get('/super/notification-templates', authMiddleware, requireRole('superadmin'), (req, res) => {
  const templates = db.prepare('SELECT event_type, subject, body_html FROM notification_templates ORDER BY event_type').all();
  res.json(templates);
});

app.put('/super/notification-templates/:eventType', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { eventType } = req.params;
  const { subject, body_html } = req.body;
  if (!subject || !body_html) return res.status(400).json({ error: 'subject y body_html son requeridos' });
  db.prepare('INSERT INTO notification_templates (event_type, subject, body_html) VALUES (?, ?, ?) ON CONFLICT(event_type) DO UPDATE SET subject = excluded.subject, body_html = excluded.body_html')
    .run(eventType, subject, body_html);
  res.json({ ok: true });
});

// Admin endpoints for per-program review items
app.get('/admin/program-review-items/:programId', authMiddleware, (req, res) => {
  const { programId } = req.params;
  const userIsAdmin = db.prepare(
    'SELECT user_id FROM program_admins WHERE program_id = ? AND user_id = ?'
  ).get(programId, req.user.id);
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!userIsAdmin && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  let items = db.prepare(
    'SELECT id, label, sort_order FROM review_items WHERE program_id = ? ORDER BY sort_order'
  ).all(programId);
  // If no program-specific items exist AND program was never initialized, copy global defaults once
  const initKey = `review_init_${programId}`;
  const alreadyInit = db.prepare('SELECT value FROM settings WHERE key = ?').get(initKey);
  if (items.length === 0 && !alreadyInit) {
    const globals = db.prepare(
      'SELECT label, sort_order FROM review_items WHERE program_id IS NULL ORDER BY sort_order'
    ).all();
    const insert = db.prepare('INSERT INTO review_items (id, label, sort_order, program_id) VALUES (?, ?, ?, ?)');
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(uuidv4(), row.label, row.sort_order, programId);
    });
    insertMany(globals);
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(initKey, '1');
    items = db.prepare(
      'SELECT id, label, sort_order FROM review_items WHERE program_id = ? ORDER BY sort_order'
    ).all(programId);
  } else if (items.length > 0 && !alreadyInit) {
    // Mark as initialized if items already exist
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(initKey, '1');
  }
  res.json(items);
});

app.post('/admin/program-review-items/:programId', authMiddleware, (req, res) => {
  const { programId } = req.params;
  const userIsAdmin = db.prepare(
    'SELECT user_id FROM program_admins WHERE program_id = ? AND user_id = ?'
  ).get(programId, req.user.id);
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!userIsAdmin && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { label, sort_order } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const id = uuidv4();
  db.prepare('INSERT INTO review_items (id, label, sort_order, program_id) VALUES (?, ?, ?, ?)')
    .run(id, label, sort_order || 0, programId);
  res.json({ id, label, sort_order: sort_order||0 });
});

app.put('/admin/program-review-items/:programId/:itemId', authMiddleware, (req, res) => {
  const { programId, itemId } = req.params;
  const userIsAdmin = db.prepare(
    'SELECT user_id FROM program_admins WHERE program_id = ? AND user_id = ?'
  ).get(programId, req.user.id);
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!userIsAdmin && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { label, sort_order } = req.body;
  const updates = [];
  const params = [];
  if (label !== undefined) { updates.push('label = ?'); params.push(label); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
  if (updates.length === 0) return res.status(400).json({ error: 'nothing to update' });
  params.push(itemId);
  params.push(programId);
  db.prepare(`UPDATE review_items SET ${updates.join(', ')} WHERE id = ? AND program_id = ?`).run(...params);
  const item = db.prepare('SELECT id, label, sort_order FROM review_items WHERE id = ? AND program_id = ?').get(itemId, programId);
  res.json(item || { error: 'not found' });
});

app.delete('/admin/program-review-items/:programId/:itemId', authMiddleware, (req, res) => {
  const { programId, itemId } = req.params;
  const userIsAdmin = db.prepare(
    'SELECT user_id FROM program_admins WHERE program_id = ? AND user_id = ?'
  ).get(programId, req.user.id);
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!userIsAdmin && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  db.prepare('DELETE FROM review_items WHERE id = ? AND program_id = ?').run(itemId, programId);
  res.json({ ok: true });
});

// Admin endpoints for per-program weights
app.get('/admin/program-weights/:programId', authMiddleware, (req, res) => {
  const { programId } = req.params;
  const userIsAdmin = db.prepare(
    'SELECT user_id FROM program_admins WHERE program_id = ? AND user_id = ?'
  ).get(programId, req.user.id);
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!userIsAdmin && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const row = db.prepare('SELECT doc_weight, presentation_weight FROM program_weights WHERE program_id = ?').get(programId);
  const result = { doc: 70, presentation: 30 };
  if (row) {
    result.doc = row.doc_weight;
    result.presentation = row.presentation_weight;
  }
  res.json(result);
});

app.post('/admin/program-weights/:programId', authMiddleware, (req, res) => {
  const { programId } = req.params;
  const userIsAdmin = db.prepare(
    'SELECT user_id FROM program_admins WHERE program_id = ? AND user_id = ?'
  ).get(programId, req.user.id);
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  if (!userIsAdmin && !roles.includes('superadmin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { doc, presentation } = req.body;
  if (doc == null || presentation == null) return res.status(400).json({ error: 'missing weights' });
  const id = db.prepare('SELECT id FROM program_weights WHERE program_id = ?').get(programId)?.id;
  if (id) {
    db.prepare('UPDATE program_weights SET doc_weight = ?, presentation_weight = ?, updated_at = ? WHERE id = ?')
      .run(doc, presentation, Math.floor(Date.now()/1000), id);
  } else {
    db.prepare('INSERT INTO program_weights (id, program_id, doc_weight, presentation_weight) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), programId, doc, presentation);
  }
  res.json({ doc, presentation });
});

app.post('/super/users', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { institutional_email, password, full_name, student_code, cedula, roles, program_ids } = req.body;
  if (!institutional_email || !password) return res.status(400).json({ error: 'institutional_email and password required' });
  // uniqueness checks
  const existsEmail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
  if (existsEmail) return res.status(400).json({ error: 'institutional_email already in use' });
  if (student_code) {
    const exists = db.prepare('SELECT id FROM users WHERE student_code = ?').get(student_code);
    if (exists) return res.status(400).json({ error: 'student_code already in use' });
  }
  if (cedula) {
    const exists = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (exists) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, institutional_email, password_hash, full_name || null, student_code || null, cedula || null, institutional_email || null);
    if (roles && Array.isArray(roles)) {
      for (const r of roles) {
        db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), id, r);
      }
    }
    // if the user is an admin and programs were provided, link them
    if (roles && Array.isArray(roles) && roles.includes('admin') && Array.isArray(program_ids)) {
      for (const pid of program_ids) {
        db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
          .run(uuidv4(), pid, id);
      }
    }

    res.json({ id, institutional_email, full_name, student_code, cedula, institutional_email, roles: roles || [], program_ids: program_ids || [] });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) return res.status(400).json({ error: 'duplicate value' });
    res.status(500).json({ error: msg });
  }
});

// Admins (not necessarily super) may create evaluators
app.post('/users', authMiddleware, requireRole('admin'), async (req, res) => {
  let { institutional_email, full_name, specialty, cedula } = req.body;
  let { password } = req.body;
  if (!institutional_email) return res.status(400).json({ error: 'institutional_email required' });
  // Convertir nombre a mayúsculas
  if (full_name) full_name = full_name.toUpperCase();
  // Auto-generate password as firstName+cedula if not provided
  if (!password) {
    const firstName = (full_name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'evaluador';
    password = `${firstName}${cedula || Math.random().toString(36).slice(-6)}`;
  }
  const existsEmail = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
  if (existsEmail) return res.status(400).json({ error: 'institutional_email already in use' });
  if (cedula) {
    const existsCedula = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (existsCedula) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, institutional_email, cedula) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, institutional_email, password_hash, full_name || null, institutional_email, cedula || null);
    // assign evaluator role
    db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), id, 'evaluator');
    // save profile with specialty
    db.prepare('INSERT OR REPLACE INTO profiles (id, full_name, institutional_email, cedula, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, full_name || null, institutional_email, cedula || null, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    if (specialty) {
      db.prepare('UPDATE profiles SET specialty = ? WHERE id = ?').run(specialty, id);
    }
    res.json({ id, institutional_email, full_name, specialty, cedula, roles: ['evaluator'], generatedPassword: password });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE')) return res.status(400).json({ error: 'duplicate value' });
    res.status(500).json({ error: msg });
  }
});

app.put('/super/users/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const uid = req.params.id;
  const { institutional_email, password, full_name, student_code, cedula, roles, program_ids } = req.body;
  // ensure user exists
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!existing) return res.status(404).json({ error: 'not found' });
  // uniqueness checks (exclude self)
  if (institutional_email && institutional_email !== existing.institutional_email) {
    const e = db.prepare('SELECT id FROM users WHERE institutional_email = ?').get(institutional_email);
    if (e) return res.status(400).json({ error: 'institutional_email already in use' });
  }
  if (student_code && student_code !== existing.student_code) {
    const e = db.prepare('SELECT id FROM users WHERE student_code = ?').get(student_code);
    if (e) return res.status(400).json({ error: 'student_code already in use' });
  }
  if (cedula && cedula !== existing.cedula) {
    const e = db.prepare('SELECT id FROM users WHERE cedula = ?').get(cedula);
    if (e) return res.status(400).json({ error: 'cedula already in use' });
  }
  try {
    const updates = [];
    const params = [];
    if (full_name) { updates.push('full_name = ?'); params.push(full_name); }
    if (student_code !== undefined) { updates.push('student_code = ?'); params.push(student_code || null); }
    if (cedula !== undefined) { updates.push('cedula = ?'); params.push(cedula || null); }
    if (institutional_email !== undefined) { updates.push('institutional_email = ?'); params.push(institutional_email || null); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?'); params.push(hash);
    }
    // also update email column to match
    if (institutional_email !== undefined) { updates.push('email = ?'); params.push(institutional_email || null); }
    if (updates.length) {
      params.push(uid);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    // Sync director name in thesis_directors
    if (full_name) {
      db.prepare('UPDATE thesis_directors SET name = ? WHERE user_id = ?').run(full_name, uid);
    }
    if (roles && Array.isArray(roles)) {
      // replace roles
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(uid);
      for (const r of roles) {
        db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), uid, r);
      }
    }
    // if the user is or becomes an admin, update program_admins links
    if (Array.isArray(program_ids)) {
      // remove existing links first
      db.prepare('DELETE FROM program_admins WHERE user_id = ?').run(uid);
      for (const pid of program_ids) {
        db.prepare('INSERT OR IGNORE INTO program_admins (id, program_id, user_id) VALUES (?, ?, ?)')
          .run(uuidv4(), pid, uid);
      }
    }
    const updated = db.prepare('SELECT id, full_name, student_code, cedula, institutional_email FROM users WHERE id = ?').get(uid);
    const newRoles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(uid).map(r=>r.role);
    // fetch program_ids for response
    const prows = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(uid);
    const pids = prows.map(r=>r.program_id);
    res.json({ ...updated, roles: newRoles, program_ids: pids });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/super/users/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const uid = req.params.id;

  const tx = db.transaction(() => {
    // For each thesis created by this user, delete ALL children in dependency order
    const theses = db.prepare('SELECT id FROM theses WHERE created_by = ?').all(uid);
    for (const t of theses) {
      // evaluations for ALL evaluators of this thesis (not just this user)
      db.prepare(`DELETE FROM evaluation_files WHERE evaluation_id IN (
        SELECT e.id FROM evaluations e
        JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
        WHERE te.thesis_id = ?)`).run(t.id);
      db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id IN (
        SELECT e.id FROM evaluations e
        JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
        WHERE te.thesis_id = ?)`).run(t.id);
      db.prepare(`DELETE FROM evaluations WHERE thesis_evaluator_id IN (
        SELECT id FROM thesis_evaluators WHERE thesis_id = ?)`).run(t.id);

      db.prepare('DELETE FROM thesis_evaluators WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_students WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_files WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_timeline WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM thesis_programs WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM timeline_events WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM acta_signatures WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM meritoria_signatures WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM signing_tokens WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM notifications WHERE related_thesis_id = ?').run(t.id);
      const actas = db.prepare('SELECT id FROM signed_actas WHERE thesis_id = ?').all(t.id);
      for (const a of actas) {
        db.prepare('DELETE FROM digital_signatures WHERE signed_acta_id = ?').run(a.id);
      }
      db.prepare('DELETE FROM digital_signatures WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM signed_actas WHERE thesis_id = ?').run(t.id);
      db.prepare('DELETE FROM theses WHERE id = ?').run(t.id);
    }

    // remove evaluation data where this user was an evaluator on other theses
    db.prepare(`DELETE FROM evaluation_files WHERE evaluation_id IN (
      SELECT e.id FROM evaluations e
      JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
      WHERE te.evaluator_id = ?)`).run(uid);
    db.prepare(`DELETE FROM evaluation_scores WHERE evaluation_id IN (
      SELECT e.id FROM evaluations e
      JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
      WHERE te.evaluator_id = ?)`).run(uid);
    db.prepare(`DELETE FROM evaluations WHERE thesis_evaluator_id IN (
      SELECT id FROM thesis_evaluators WHERE evaluator_id = ?)`).run(uid);

    // clear all direct user associations
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM thesis_students WHERE student_id = ?').run(uid);
    db.prepare('DELETE FROM thesis_evaluators WHERE evaluator_id = ?').run(uid);
    db.prepare('DELETE FROM program_admins WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM smtp_config WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM acta_signatures WHERE signer_user_id = ?').run(uid);
    db.prepare('DELETE FROM digital_signatures WHERE signer_user_id = ?').run(uid);

    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });

  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /super/users] error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// comprobar existencia de código o cédula (útil para validación en frontend)
// this endpoint is public so that users can verify uniqueness during registration
app.get('/users/check', (req, res) => {
  const { student_code, cedula, institutional_email } = req.query;
  const result = {};
  if (student_code) {
    const r = db.prepare('SELECT 1 FROM users WHERE student_code = ?').get(student_code);
    result.student_code = !!r;
  }
  if (cedula) {
    const r = db.prepare('SELECT 1 FROM users WHERE cedula = ?').get(cedula);
    result.cedula = !!r;
  }
  if (institutional_email) {
    const r = db.prepare('SELECT 1 FROM users WHERE institutional_email = ?').get(institutional_email);
    result.institutional_email = !!r;
  }
  res.json(result);
});

// Theses endpoints
app.post('/theses', authMiddleware, upload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'endorsement', maxCount: 1 },
]), async (req, res) => {
  // Soporta tanto JSON como multipart/form-data (con archivos)
  const tryParse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
  const title       = req.body.title;
  const abstract    = req.body.abstract;
  const keywords    = req.body.keywords || null;
  const urlField    = req.body.url || null;
  const cvlac       = req.body.cvlac || null;
  const companion   = tryParse(req.body.companion);
  const program_ids = tryParse(req.body.program_ids);
  const directors   = tryParse(req.body.directors);

  if (!title) return res.status(400).json({ error: 'title required' });

  // Verificar que no exista otra tesis con el mismo título (ignorando mayúsculas)
  const dupTitle = db.prepare(
    "SELECT id FROM theses WHERE LOWER(title) = LOWER(?) AND status != 'deleted'"
  ).get(title.trim());
  if (dupTitle) return res.status(400).json({ error: 'Ya existe una tesis con ese título' });

  // Verificar que el estudiante no tenga ya una tesis activa
  const dupStudent = db.prepare(`
    SELECT t.id FROM theses t
    JOIN thesis_students ts ON ts.thesis_id = t.id
    WHERE ts.student_id = ? AND t.status != 'deleted'
  `).get(req.user.id);
  if (dupStudent) return res.status(400).json({ error: 'Ya tienes una tesis registrada' });

  // validate reception window based on selected program(s)
  if (program_ids && Array.isArray(program_ids) && program_ids.length > 0) {
    const now = Date.now();
    const programs = db.prepare(
      `SELECT id, name, reception_start, reception_end FROM programs WHERE id IN (${program_ids.map(() => '?').join(',')})`
    ).all(...program_ids);
    const blocked = programs.filter((p) => {
      if (p.reception_start && now < Number(p.reception_start)) return true;
      if (p.reception_end && now > Number(p.reception_end)) return true;
      return false;
    });
    if (blocked.length) {
      return res.status(400).json({
        error: 'Reception closed for selected program(s)',
        blocked: blocked.map((p) => ({ id: p.id, name: p.name })),
      });
    }
  }

  const id = uuidv4();
  const created_at = nowSec();
  try {
    db.prepare('INSERT INTO theses (id, title, abstract, keywords, created_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, title, abstract || null, keywords, req.user.id, 'draft', created_at);
  } catch (err) {
    const msg = String(err);
    if (msg.includes('NOT NULL')) {
      return res.status(400).json({ error: 'missing required field' });
    }
    throw err;
  }

  // Función de limpieza: elimina la tesis y todo lo relacionado si algo falla
  const cleanup = () => {
    try {
      db.pragma('foreign_keys = OFF');
      db.prepare('DELETE FROM thesis_files WHERE thesis_id = ?').run(id);
      db.prepare('DELETE FROM thesis_timeline WHERE thesis_id = ?').run(id);
      db.prepare('DELETE FROM thesis_directors WHERE thesis_id = ?').run(id);
      db.prepare('DELETE FROM thesis_students WHERE thesis_id = ?').run(id);
      db.prepare('DELETE FROM theses WHERE id = ?').run(id);
      db.pragma('foreign_keys = ON');
    } catch (e) { /* ignorar errores de limpieza */ }
  };

  try {
    // Asociar el estudiante que solicita y guardar cvlac
    db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)')
      .run(uuidv4(), id, req.user.id);
    if (cvlac) db.prepare('UPDATE users SET cvlac = ? WHERE id = ?').run(cvlac, req.user.id);

    // si se proporciona compañero crearlo y asociar
    if (companion) {
      if (!companion.full_name || !companion.student_code || !companion.cedula) {
        cleanup();
        return res.status(400).json({ error: 'companion requires full_name, student_code and cedula' });
      }
      // Convertir nombre del compañero a mayúsculas
      companion.full_name = companion.full_name.toUpperCase();
      const dup = db.prepare('SELECT id FROM users WHERE student_code = ? OR cedula = ?').get(companion.student_code, companion.cedula);
      if (dup) {
        cleanup();
        return res.status(400).json({ error: 'companion student_code or cedula already used' });
      }
      const compId = uuidv4();
      const compFirstName = (companion.full_name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario';
      const compPassword = `${compFirstName}_${companion.cedula || Math.random().toString(36).slice(-6)}`;
      const hash = await bcrypt.hash(compPassword, 10);
      db.prepare('INSERT INTO users (id, email, password_hash, full_name, student_code, cedula, institutional_email, cvlac) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(compId, companion.student_code + '@estudiante.local', hash, companion.full_name, companion.student_code, companion.cedula, companion.institutional_email || null, companion.cvlac || null);
      db.prepare('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)').run(uuidv4(), compId, 'student');
      db.prepare('INSERT INTO thesis_students (id, thesis_id, student_id) VALUES (?, ?, ?)').run(uuidv4(), id, compId);
      // Enviar email de bienvenida al compañero
      if (companion.institutional_email) {
        sendWelcomeEmail(db, companion.institutional_email, companion.full_name, companion.institutional_email, compPassword, null).catch(console.error);
      }
    }

    // asociar programas
    if (program_ids && Array.isArray(program_ids)) {
      for (const pid of program_ids) {
        db.prepare('INSERT INTO thesis_programs (id, thesis_id, program_id) VALUES (?, ?, ?)').run(uuidv4(), id, pid);
      }
    }

    // Guardar archivos enviados en la misma solicitud
    const reqFiles = req.files || {};
    for (const field of ['document', 'endorsement']) {
      if (reqFiles[field] && reqFiles[field][0]) {
        const f = reqFiles[field][0];
        const basename = path.basename(f.path);
        db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), id, f.originalname, field, basename, req.user.id);
      }
    }
    if (urlField) {
      db.prepare('INSERT INTO thesis_files (id, thesis_id, file_name, file_type, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), id, urlField, 'url', urlField, req.user.id);
    }

    // Guardar directores
    if (directors) {
      const dirList = Array.isArray(directors) ? directors : [];
      for (const name of dirList) {
        if (name && name.length > 1) {
          const matchedUser = db.prepare('SELECT id FROM users WHERE full_name = ?').get(name);
          db.prepare('INSERT INTO thesis_directors (id, thesis_id, name, user_id) VALUES (?, ?, ?, ?)')
            .run(uuidv4(), id, name, matchedUser?.id || null);
        }
      }
    }

    // Evento inicial en timeline
    db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), id, 'submitted', 'Tesis registrada por el estudiante', 1, created_at);

    const thesis = db.prepare('SELECT * FROM theses WHERE id = ?').get(id);
    res.json(thesis);
  } catch (err) {
    cleanup();
    throw err;
  }
});

app.get('/theses/directed', authMiddleware, (req, res) => {
  // Returns theses where the authenticated user is a director (via thesis_directors.user_id)
  const rows = db.prepare(`
    SELECT DISTINCT t.* FROM theses t
    INNER JOIN thesis_directors td ON t.id = td.thesis_id
    WHERE td.user_id = ? AND t.status != 'deleted'
    ORDER BY t.created_at DESC
  `).all(req.user.id);

  const enriched = rows.map(t => {
    const students = db.prepare(
      `SELECT u.id, u.full_name as name, u.institutional_email FROM users u
       JOIN thesis_students ts ON u.id = ts.student_id
       WHERE ts.thesis_id = ?`
    ).all(t.id);
    const programs = db.prepare(
      `SELECT p.id, p.name FROM programs p
       JOIN thesis_programs tp ON p.id = tp.program_id
       WHERE tp.thesis_id = ?`
    ).all(t.id);
    return { ...t, students, programs };
  });

  res.json(enriched);
});

// Returns theses where the authenticated user is assigned as evaluator
app.get('/theses/as-evaluator', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT t.* FROM theses t
    INNER JOIN thesis_evaluators te ON t.id = te.thesis_id
    WHERE te.evaluator_id = ? AND t.status != 'deleted'
    ORDER BY t.created_at DESC
  `).all(req.user.id);

  const enriched = rows.map(t => {
    const students = db.prepare(
      `SELECT u.id, u.full_name as name, u.institutional_email FROM users u
       JOIN thesis_students ts ON u.id = ts.student_id
       WHERE ts.thesis_id = ?`
    ).all(t.id);
    const programs = db.prepare(
      `SELECT p.id, p.name FROM programs p
       JOIN thesis_programs tp ON p.id = tp.program_id
       WHERE tp.thesis_id = ?`
    ).all(t.id);
    const evalInfo = db.prepare(
      `SELECT due_date, is_blind FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?`
    ).get(t.id, req.user.id);
    return { ...t, students, programs, due_date: evalInfo?.due_date, is_blind: !!evalInfo?.is_blind };
  });

  res.json(enriched);
});

app.get('/theses', authMiddleware, (req, res) => {
  // Decide qué tesis devolver según el rol del usuario
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r=>r.role);
  console.log('GET /theses requested by user', req.user.id, 'roles:', roles);
  let rows;
  if (roles.includes('superadmin')) {
    rows = db.prepare(`SELECT * FROM theses WHERE status != 'deleted' ORDER BY created_at DESC`).all();
  } else if (roles.includes('admin')) {
    // El admin solo ve tesis de los programas que tiene asignados
    const adminPrograms = db.prepare(`SELECT program_id FROM program_admins WHERE user_id = ?`).all(req.user.id).map(r => r.program_id);
    if (adminPrograms.length === 0) {
      rows = [];
    } else {
      const placeholders = adminPrograms.map(() => '?').join(',');
      rows = db.prepare(`
        SELECT DISTINCT t.* FROM theses t
        JOIN thesis_programs tp ON t.id = tp.thesis_id
        WHERE tp.program_id IN (${placeholders}) AND t.status != 'deleted'
        ORDER BY t.created_at DESC
      `).all(...adminPrograms);
    }
  } else if (roles.includes('evaluator')) {
    // sólo tesis asignadas a este evaluador, evitar duplicados si hay registros repetidos
    rows = db.prepare(`
      SELECT DISTINCT t.* FROM theses t
      INNER JOIN thesis_evaluators te ON t.id = te.thesis_id
      WHERE te.evaluator_id = ? AND t.status != 'deleted'
      ORDER BY t.created_at DESC
    `).all(req.user.id);
  } else {
    // Include theses where the student is explicitly linked (thesis_students)
    // and those where the student is the creator (created_by), to support older
    // records that may not have a thesis_students entry.
    rows = db.prepare(`
      SELECT DISTINCT t.* FROM theses t
      LEFT JOIN thesis_students ts ON t.id = ts.thesis_id
      WHERE (ts.student_id = ? OR t.created_by = ?) AND t.status != 'deleted'
      ORDER BY t.created_at DESC
    `).all(req.user.id, req.user.id);
  }

  // enriquecer con estudiantes, evaluadores y línea de tiempo
  const enriched = rows.map(t => {
    const students = db.prepare(
      `SELECT u.id, u.full_name as name, u.student_code, u.cedula, u.institutional_email, u.cvlac FROM users u
       JOIN thesis_students ts ON u.id = ts.student_id
       WHERE ts.thesis_id = ?`
    ).all(t.id);
    const evaluators = db.prepare(
      `SELECT DISTINCT u.id, u.full_name as name, u.institutional_email, te.due_date, te.is_blind
       FROM users u
       JOIN thesis_evaluators te ON u.id = te.evaluator_id
       WHERE te.thesis_id = ?`
    ).all(t.id).map(ev => ({ ...ev, is_blind: !!ev.is_blind }));
    const directors = db.prepare(
      `SELECT name FROM thesis_directors WHERE thesis_id = ?`
    ).all(t.id).map(r => r.name);
    const programs = db.prepare(
      `SELECT p.id, p.name FROM programs p
       JOIN thesis_programs tp ON p.id = tp.program_id
       WHERE tp.thesis_id = ?`
    ).all(t.id);
    let timeline = db.prepare(
      `SELECT id, event_type as status, description as label, created_at as date, completed
       FROM thesis_timeline WHERE thesis_id = ? ORDER BY created_at ASC`
    ).all(t.id);
    // Hide signature events from students
    const isStudentRole = !roles.includes('admin') && !roles.includes('superadmin') && !roles.includes('evaluator');
    if (isStudentRole) {
      timeline = timeline.filter(ev => ev.status !== 'act_signature');
      // Hide evaluator names for blind review from students
      evaluators.forEach(ev => { if (ev.is_blind) ev.name = null; });
    }
    // enrich assignment/defense entries and prepare evaluator submission events
    let enrichedTimeline = timeline || [];
    if (enrichedTimeline && enrichedTimeline.length && evaluators && evaluators.length) {
      const blind = evaluators.some(e => e.is_blind);
      const count = evaluators.length;
      enrichedTimeline = enrichedTimeline.map(ev => {
        if (ev.status === 'evaluators_assigned') {
          if (blind) {
            ev.label = `Evaluadores asignados (${count}) (pares ciegos)`;
          } else {
            const names = evaluators.map(e => e.name).filter(Boolean);
            ev.label = `Evaluadores asignados (${count})${names.length ? `: ${names.join(', ')}` : ''}`;
          }
        }
        if (ev.status === 'defense_scheduled') {
          // ev.label contains the original description (aliased from 'description' column)
          const desc = ev.label || '';
          ev.label = desc.startsWith('Sustentación reprogramada') ? 'Sustentación reprogramada' : 'Sustentación programada';
          const fechaMatch = desc.match(/Fecha:\s*(.+)/);
          const lugarMatch = desc.match(/Lugar:\s*(.+)/);
          if (fechaMatch) {
            ev.defense_date_display = fechaMatch[1].trim();
          }
          ev.defense_location = lugarMatch ? lugarMatch[1].trim() : (t.defense_location || '');
          ev.defense_info = t.defense_info;
        }
        return ev;
      });
      // remove any old generic submission events so we can re-add detailed ones below
      enrichedTimeline = enrichedTimeline.filter(ev => ev.status !== 'evaluation_submitted');
    }
    // NOTE: detailed evaluation events will be added after we fetch evaluations below
    let files = db.prepare(
      `SELECT id, file_name, file_url, file_type FROM thesis_files WHERE thesis_id = ?`
    ).all(t.id);
    files = files.map(f => ({
      ...f,
      file_url: `/uploads/${path.basename(f.file_url)}`,
    }));
    // evaluations and their files
    const evaluations = db.prepare(
      `SELECT e.*, te.evaluator_id, te.id as thesis_evaluator_id, u.full_name as evaluator_name
       FROM evaluations e
       JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
       LEFT JOIN users u ON u.id = te.evaluator_id
       WHERE te.thesis_id = ?`
    ).all(t.id);
    for (const ev of evaluations) {
      const evfiles = db.prepare(
        `SELECT id, file_name, file_url FROM evaluation_files WHERE evaluation_id = ?`
      ).all(ev.id);
      ev.files = evfiles.map(f => ({
        ...f,
        file_url: `/uploads/${path.basename(f.file_url)}`,
      }));
      const scores = db.prepare(
        `SELECT section_id, criterion_id, score, observations FROM evaluation_scores WHERE evaluation_id = ?`
      ).all(ev.id);
      ev.scores = scores;
    }
    const isBlindReview = evaluators && evaluators.some(e => e.is_blind);
    // after loading individual evaluations we can add detailed submission events
    if (evaluations && Array.isArray(evaluations)) {
      const evalEvents = evaluations.map((ev, index) => {
        const typeWord = ev.evaluation_type === 'presentation' ? 'sustentación' : 'documento';
        const displayName = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
        const actorName = isBlindReview ? 'Evaluador (Par ciego)' : (ev.evaluator_name || 'Evaluador');
        const event = {
          id: uuidv4(),
          status: 'evaluation_submitted',
          label: `Evaluación de ${typeWord} enviada por ${displayName}`,
          completed: 1,
          date: ev.submitted_at || ev.created_at,
          actor: actorName,
          actorRole: 'evaluator',
        };
        if (ev.general_observations) event.evaluatorRecommendations = ev.general_observations;
        if (ev.files && ev.files.length) event.evaluatorFiles = ev.files.map(f=>({name:f.file_name,url:f.file_url}));
        if (ev.scores && ev.scores.length) event.evaluationScores = ev.scores;
        event.evaluationType = ev.evaluation_type;
        return event;
      });
      enrichedTimeline = enrichedTimeline.concat(evalEvents);
      // normalize revision events and attach any revision files
      enrichedTimeline = enrichedTimeline.map(ev => {
        if (ev.status === 'revision_submitted') {
          // keep comment in observations, standardize label
          if (ev.label && ev.label !== 'Revisión enviada por estudiante') {
            ev.observations = ev.label;
          }
          ev.label = 'Revisión enviada por estudiante';

          const revFiles = db.prepare('SELECT file_name, file_url FROM thesis_files WHERE timeline_event_id = ?').all(ev.id);
          if (revFiles && revFiles.length) {
            ev.revisionFiles = revFiles.map(f => ({ name: f.file_name, url: f.file_url }));
          }
        }
        return ev;
      });
    }
    // if every assigned evaluator has provided an evaluation, add a timeline summary event
    if (evaluations && evaluations.length && evaluators && evaluations.length === evaluators.length) {
      const recs = evaluations.map((ev, index) => {
        let text = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
        if (ev.general_observations) text += `: ${ev.general_observations}`;
        if (ev.concept) text += ` (concepto: ${ev.concept})`;
        return text;
      }).join("\n\n");
      const filesList = [];
      for (const ev of evaluations) {
        if (ev.files && ev.files.length) {
          ev.files.forEach((f) => filesList.push({ name: f.file_name, url: f.file_url }));
        }
      }
      enrichedTimeline.push({
        id: uuidv4(),
        status: 'evaluations_summary',
        label: 'Evaluaciones recibidas',
        completed: 1,
        date: Math.max(...evaluations.map((e) => e.submitted_at || 0)),
        evaluatorRecommendations: recs,
        evaluatorFiles: filesList,
      });
    }
    // ensure the timeline is ordered by date so scheduled event appears after evaluations
    // when events are nearly simultaneous (< 5s apart), use priority: status_changed and
    // concept events appear before evaluation_submitted so the student sees the result first.
    const eventPriority = (status) => {
      if (status === 'status_changed') return 0;
      if (status === 'concept_issued') return 1;
      if (status === 'evaluation_submitted') return 2;
      if (status === 'evaluations_summary') return 3;
      return 1;
    };
    // normalize any leftover ms timestamps to seconds before sorting
    const normTs = (v) => (v && v > 1e12) ? Math.floor(v / 1000) : (v || 0);
    enrichedTimeline.sort((a, b) => {
      const da = normTs(a.date);
      const db_ = normTs(b.date);
      if (Math.abs(da - db_) < 5) {
        const pa = eventPriority(a.status);
        const pb = eventPriority(b.status);
        if (pa !== pb) return pa - pb;
      }
      return da - db_;
    });
    const weighted = computeFinalWeightedForThesis(t.id);
    return { ...t, students, evaluators, directors, programs, timeline: enrichedTimeline, files, evaluations, weighted };
  });

  res.json(enriched);
});

app.get('/theses/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const thesis = db.prepare('SELECT *, final_weighted_override FROM theses WHERE id = ?').get(id);
  if (!thesis) return res.status(404).json({ error: 'not found' });
  const students = db.prepare(
    `SELECT u.id, u.full_name as name, u.student_code, u.cedula, u.email, u.institutional_email, u.cvlac FROM users u
     JOIN thesis_students ts ON u.id = ts.student_id
     WHERE ts.thesis_id = ?`
  ).all(id);
  const evaluators = db.prepare(
    `SELECT u.id, u.full_name as name, u.institutional_email, te.due_date, te.is_blind
     FROM users u
     JOIN thesis_evaluators te ON u.id = te.evaluator_id
     WHERE te.thesis_id = ?`
  ).all(id).map(ev => ({ ...ev, is_blind: !!ev.is_blind }));
  const directors = db.prepare(
    `SELECT td.name, u.email, u.institutional_email 
     FROM thesis_directors td
     LEFT JOIN users u ON td.user_id = u.id
     WHERE td.thesis_id = ?`
  ).all(id);
  const programs = db.prepare(
    `SELECT p.id, p.name FROM programs p
     JOIN thesis_programs tp ON p.id = tp.program_id
     WHERE tp.thesis_id = ?`
  ).all(id);

  // also load any evaluations and attach scores/files (needed for evaluators)
  const evaluations = db.prepare(
    `SELECT e.*, te.evaluator_id, te.id as thesis_evaluator_id, u.full_name as evaluator_name
     FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     LEFT JOIN users u ON u.id = te.evaluator_id
     WHERE te.thesis_id = ?`
  ).all(id);
  for (const ev of evaluations) {
    const evfiles = db.prepare(
      `SELECT id, file_name, file_url FROM evaluation_files WHERE evaluation_id = ?`
    ).all(ev.id);
    ev.files = evfiles.map(f => ({
      ...f,
      file_url: `/uploads/${path.basename(f.file_url)}`,
    }));
    const scores = db.prepare(
      `SELECT section_id, criterion_id, score, observations FROM evaluation_scores WHERE evaluation_id = ?`
    ).all(ev.id);
    ev.scores = scores;
  }

  let timeline = db.prepare(
    `SELECT id, event_type as status, description as label, created_at as date, completed
     FROM thesis_timeline WHERE thesis_id = ? ORDER BY created_at ASC`
  ).all(id);
  // Hide signature events from students
  const rolesForFilter = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isStudentRole2 = !rolesForFilter.includes('admin') && !rolesForFilter.includes('superadmin') && !rolesForFilter.includes('evaluator');
  if (isStudentRole2) {
    timeline = timeline.filter(ev => ev.status !== 'act_signature');
  }
  // enrich assignment/defense entries
  if (timeline && timeline.length && evaluators && evaluators.length) {
    const blind = evaluators.some(e => e.is_blind);
    const count = evaluators.length;
    timeline = timeline.map(ev => {
      if (ev.status === 'evaluators_assigned') {
        if (blind) {
          ev.label = `Evaluadores asignados (${count}) (pares ciegos)`;
        } else {
          const names = evaluators.map(e => e.name).filter(Boolean);
          ev.label = `Evaluadores asignados (${count})${names.length ? `: ${names.join(', ')}` : ''}`;
        }
      }
      if (ev.status === 'defense_scheduled') {
        const desc = ev.label || '';
        ev.label = desc.startsWith('Sustentación reprogramada') ? 'Sustentación reprogramada' : 'Sustentación programada';
        const fechaMatch = desc.match(/Fecha:\s*(.+)/);
        const lugarMatch = desc.match(/Lugar:\s*(.+)/);
        if (fechaMatch) {
          ev.defense_date_display = fechaMatch[1].trim();
        }
        ev.defense_location = lugarMatch ? lugarMatch[1].trim() : (thesis.defense_location || '');
        ev.defense_info = thesis.defense_info;
      }
      return ev;
    });
    // drop old generic submission events; will recreate below
    timeline = timeline.filter(ev => ev.status !== 'evaluation_submitted');
  }
  const isBlindReview = evaluators && evaluators.some(e => e.is_blind);
  // add detailed evaluation_submitted events using actual evaluations
  if (evaluations && Array.isArray(evaluations)) {
    const evalEvents = evaluations.map((ev, index) => {
      const typeWord = ev.evaluation_type === 'presentation' ? 'sustentación' : 'documento';
      const displayName = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
      const actorName = isBlindReview ? 'Evaluador (Par ciego)' : (ev.evaluator_name || 'Evaluador');
      const event = {
        id: uuidv4(),
        status: 'evaluation_submitted',
        label: `Evaluación de ${typeWord} enviada por ${displayName}`,
        completed: 1,
        date: ev.submitted_at || ev.created_at,
        actor: actorName,
        actorRole: 'evaluator',
      };
      if (ev.general_observations) {
        // add comments as recommendations field
        event.evaluatorRecommendations = ev.general_observations;
      }
      if (ev.files && ev.files.length) {
        event.evaluatorFiles = ev.files.map((f) => ({ name: f.file_name, url: f.file_url }));
      }
      return event;
    });
    timeline = timeline.concat(evalEvents);
  }
  // attach revision files to revision_submitted events
  timeline = timeline.map(ev => {
    if (ev.status === 'revision_submitted') {
      // keep any custom label text in observations and set generic label
      if (ev.label && ev.label !== 'Revisión enviada por estudiante') {
        ev.observations = ev.label;
      }
      ev.label = 'Revisión enviada por estudiante';

      const revFiles = db.prepare('SELECT file_name, file_url FROM thesis_files WHERE timeline_event_id = ?').all(ev.id);
      if (revFiles && revFiles.length) {
        ev.revisionFiles = revFiles.map(f => ({ name: f.file_name, url: f.file_url }));
      }
    }
    return ev;
  });
  let files = db.prepare(
    `SELECT id, file_name, file_url, file_type FROM thesis_files WHERE thesis_id = ?`
  ).all(id);
  files = files.map(f => ({
    ...f,
    file_url: `/uploads/${path.basename(f.file_url)}`,
  }));
  // if every assigned evaluator has submitted at least one evaluation, append a summary event
  if (evaluations && evaluations.length && evaluators && evaluators.length) {
    // count unique evaluators in the evaluations array
    const uniqueEvals = new Set(evaluations.map(ev => ev.evaluator_id));
    if (uniqueEvals.size === evaluators.length) {
      const recs = evaluations.map((ev, index) => {
        let text = isBlindReview ? `Evaluador ${index + 1}` : (ev.evaluator_name || 'Evaluador');
        if (ev.general_observations) text += `: ${ev.general_observations}`;
        if (ev.concept) text += ` (concepto: ${ev.concept})`;
        return text;
      }).join("\n\n");
      const filesList = [];
      for (const ev of evaluations) {
        if (ev.files && ev.files.length) {
          ev.files.forEach((f) => filesList.push({ name: f.file_name, url: f.file_url }));
        }
      }
      timeline.push({
        id: uuidv4(),
        status: 'evaluations_summary',
        label: 'Evaluaciones recibidas',
        completed: 1,
        date: Math.max(...evaluations.map((e) => e.submitted_at || 0)),
        evaluatorRecommendations: recs,
        evaluatorFiles: filesList,
      });
    }
  }
  // sort after possibly inserting summary so defense_scheduled (with higher timestamp) comes last
  const normTs2 = (v) => (v && v > 1e12) ? Math.floor(v / 1000) : (v || 0);
  timeline.sort((a,b) => normTs2(a.date) - normTs2(b.date));

  // Compute weighted scores for the student view
  const weighted = computeFinalWeightedForThesis(id);

  res.json({ ...thesis, students, evaluators, directors, programs, timeline, files, evaluations, weighted });
});

// helper to recalc thesis status based on evaluations
function recalcThesisStatus(thesis_id) {
  // Check for presentation evaluations first — if any exist, thesis is finalized
  const presEvals = db.prepare(
    `SELECT e.id FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ? AND e.evaluation_type = 'presentation'`
  ).all(thesis_id);
  if (presEvals.length > 0) {
    const th = db.prepare('SELECT status FROM theses WHERE id = ?').get(thesis_id);
    if (th && th.status !== 'finalized') {
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run('finalized', thesis_id);
      db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), thesis_id, 'status_changed', 'Estado cambiado a finalized', 1, nowSec());
      notifyTimeline(db, thesis_id, 'status_changed', 'Estado cambiado a finalized', null).catch(console.error);
    }
    return;
  }

  // consider only the most recent document evaluation submitted by each evaluator
  const evals = db.prepare(
    `SELECT e.concept FROM evaluations e
     JOIN thesis_evaluators te ON te.id = e.thesis_evaluator_id
     WHERE te.thesis_id = ?
     AND e.evaluation_type = 'document'
     AND e.submitted_at = (
         SELECT MAX(submitted_at) FROM evaluations e2
         WHERE e2.thesis_evaluator_id = e.thesis_evaluator_id
         AND e2.evaluation_type = 'document'
       )`
  ).all(thesis_id).map(r => r.concept);
  if (evals.length === 0) return;
  let newStatus = null;
  if (evals.some(c => c === 'major_changes')) {
    newStatus = 'revision_cuidados';
  } else if (evals.some(c => c === 'minor_changes')) {
    newStatus = 'revision_minima';
  } else if (evals.every(c => c === 'accepted') && evals.length >= 2) {
    newStatus = 'sustentacion';
  }
  if (newStatus) {
    const th = db.prepare('SELECT status FROM theses WHERE id = ?').get(thesis_id);
    if (th && th.status !== newStatus) {
      db.prepare('UPDATE theses SET status = ? WHERE id = ?').run(newStatus, thesis_id);
      db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), thesis_id, 'status_changed', `Estado cambiado a ${newStatus}`, 1, nowSec());
      notifyTimeline(db, thesis_id, 'status_changed', `Estado cambiado a ${newStatus}`, null).catch(console.error);
    }
  }
}

// Evaluations
app.post('/evaluations', authMiddleware, requireRole('evaluator'), (req, res) => {
  const { thesis_id, score, observations, concept, sections, evaluation_type } = req.body;
  if (!thesis_id) return res.status(400).json({ error: 'thesis_id required' });
  const thesisRow = db.prepare('SELECT id, revision_round FROM theses WHERE id = ?').get(thesis_id);
  if (!thesisRow) return res.status(404).json({ error: 'thesis not found' });
  // find corresponding thesis_evaluator record
  const te = db.prepare('SELECT id FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesis_id, req.user.id);
  if (!te) return res.status(403).json({ error: 'not assigned to this thesis' });
  const id = uuidv4();
  const now = nowSec();
  const type = evaluation_type === 'presentation' ? 'presentation' : 'document';
  const round = Number(thesisRow.revision_round || 0);

  // Prevent duplicate evaluation for same evaluator, type and round
  const existingEval = db.prepare('SELECT id FROM evaluations WHERE thesis_evaluator_id = ? AND evaluation_type = ? AND revision_round = ?').get(te.id, type, round);
  if (existingEval) {
    return res.status(409).json({ error: 'Ya existe una evaluación para este tipo y ronda', existing_id: existingEval.id });
  }

  db.prepare('INSERT INTO evaluations (id, thesis_evaluator_id, concept, evaluation_type, revision_round, final_score, general_observations, submitted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, te.id, concept || null, type, round, score || null, observations || null, now, now);

  // store individual criterion scores if provided
  if (sections && Array.isArray(sections)) {
    const insertScore = db.prepare('INSERT INTO evaluation_scores (id, evaluation_id, section_id, criterion_id, score, observations) VALUES (?, ?, ?, ?, ?, ?)');
    for (const section of sections) {
      for (const criterion of section.criteria || []) {
        if (criterion.score !== undefined && criterion.score !== null) {
          insertScore.run(uuidv4(), id, section.id, criterion.id, criterion.score, criterion.observations || null);
        }
      }
    }
  }

  // add timeline event for admin visibility with evaluator name and type
  // fetch evaluator full name (stored on req.user by auth middleware)
  const evaluatorRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.user.id);
  const evaluatorName = (evaluatorRow && evaluatorRow.full_name) ? evaluatorRow.full_name : 'Evaluador';
  const descType = type === 'presentation' ? 'sustentación' : 'documento';
  const evalDesc = `Evaluación de ${descType} enviada por ${evaluatorName}`;
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'evaluation_submitted', evalDesc, 1, now);
  notifyTimeline(db, thesis_id, 'evaluation_submitted', evalDesc, req.user.id).catch(console.error);

  // recalc status
  recalcThesisStatus(thesis_id);

  const evalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);
  res.json(evalRow);
});

// schedule sustentación (solo admin)
app.post('/theses/:id/schedule', authMiddleware, requireRole('admin'), (req, res) => {
  const thesis_id = req.params.id;
  const { date, location, info } = req.body;
  if (!date || !location) {
    return res.status(400).json({ error: 'date and location required' });
  }
  // datetime-local sends "YYYY-MM-DDTHH:mm" without timezone — treat as Colombia time (UTC-5)
  const dateStr = date.length === 16 ? date + ':00-05:00' : date;
  const ts = Date.parse(dateStr);
  if (isNaN(ts)) {
    return res.status(400).json({ error: 'invalid date' });
  }
  // Convert milliseconds to seconds (database uses Unix seconds)
  const tsSeconds = Math.floor(ts / 1000);
  // Determine if this is a reschedule (previous defense_date already set)
  const existing = db.prepare('SELECT defense_date FROM theses WHERE id = ?').get(thesis_id);
  const isReschedule = existing && existing.defense_date != null;
  db.prepare('UPDATE theses SET defense_date = ?, defense_location = ?, defense_info = ? WHERE id = ?')
    .run(tsSeconds, location, info || null, thesis_id);
  // Format date in Colombia timezone for display
  const dateDisplay = new Date(ts).toLocaleString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const verb = isReschedule ? 'Sustentación reprogramada' : 'Sustentación programada';
  let desc = `${verb}:\n• Fecha: ${dateDisplay}\n• Lugar: ${location}`;
  if (info) desc += `\n• ${info}`;
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesis_id, 'defense_scheduled', desc, 1, nowSec());
  notifyTimeline(db, thesis_id, 'defense_scheduled', desc, req.user.id).catch(console.error);
  res.json({ ok: true });
});

// update existing evaluation (evaluador puede editar)
app.put('/evaluations/:id', authMiddleware, requireRole('evaluator'), (req, res) => {
  const evalId = req.params.id;
  const { score, observations, concept, sections } = req.body;
  const evalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId);
  if (!evalRow) return res.status(404).json({ error: 'not found' });
  // verify ownership via thesis_evaluator
  const te = db.prepare('SELECT * FROM thesis_evaluators WHERE id = ?').get(evalRow.thesis_evaluator_id);
  if (!te || te.evaluator_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const now = nowSec();
  db.prepare('UPDATE evaluations SET concept = ?, final_score = ?, general_observations = ?, updated_at = ? WHERE id = ?')
    .run(concept || null, score || null, observations || null, now, evalId);
  // replace scores
  db.prepare('DELETE FROM evaluation_scores WHERE evaluation_id = ?').run(evalId);
  if (sections && Array.isArray(sections)) {
    const insertScore = db.prepare('INSERT INTO evaluation_scores (id, evaluation_id, section_id, criterion_id, score, observations) VALUES (?, ?, ?, ?, ?, ?)');
    for (const section of sections) {
      for (const criterion of section.criteria || []) {
        if (criterion.score !== undefined && criterion.score !== null) {
          insertScore.run(uuidv4(), evalId, section.id, criterion.id, criterion.score, criterion.observations || null);
        }
      }
    }
  }
  // recalc thesis status
  if (te && te.thesis_id) {
    recalcThesisStatus(te.thesis_id);
  }
  res.json({ ok: true });
});

// estado y firmas del acta
app.get('/theses/:id/acta/status', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isEvaluatorAssigned = db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin && !isEvaluatorAssigned) return res.status(403).json({ error: 'forbidden' });

  const allEvaluatorsDone = ctx.evaluators.every(ev => hasEvaluatorCompletedRequired(thesisId, ev.id));
  const evaluatorSignatures = ctx.signatures.filter(s => s.signer_role === 'evaluator');
  const directorSignatures = ctx.signatures.filter(s => s.signer_role === 'director');
  const programDirectorSignature = ctx.signatures.find(s => s.signer_role === 'program_director');

  // Calcular estado de firmas DIGITALES (tabla digital_signatures)
  const digitalSigs = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ? ORDER BY signed_at ASC').all(thesisId);
  const digitalPendingSigners = [
    ...ctx.evaluators.map(e => ({ user_id: e.id, name: e.name, role: 'evaluator' })),
    ...ctx.directors.map(d => ({ user_id: null, name: d, role: 'director' })),
    { user_id: null, name: 'Director del Programa', role: 'program_director' }
  ].filter(r => {
    if (r.role === 'evaluator') return !digitalSigs.some(ds => String(ds.signer_user_id) === String(r.user_id) && ds.signer_role === 'evaluator');
    if (r.role === 'director') return !digitalSigs.some(ds => ds.signer_name.toLowerCase() === r.name.toLowerCase() && ds.signer_role === 'director');
    return !digitalSigs.some(ds => ds.signer_role === 'program_director');
  });
  const digitalAllSigned = digitalPendingSigners.length === 0 && (ctx.evaluators.length + ctx.directors.length + 1) > 0;
  const digitalSignatures = digitalSigs.map(s => ({
    signer_name: s.signer_name,
    signer_role: s.signer_role,
    signed_at: s.signed_at,
    certificate_cn: s.certificate_cn,
  }));

  res.json({
    ...ctx,
    allEvaluatorsDone,
    missingEvaluatorSignatures: ctx.evaluators.filter(ev => !evaluatorSignatures.some(s => String(s.signer_user_id) === String(ev.id))),
    evaluatorSignatures,
    directorSignatures,
    programDirectorSignature,
    allSigned: digitalAllSigned,
    digitalSignatures,
    digitalPendingSigners,
    canEvaluatorSign: !!isEvaluatorAssigned && hasEvaluatorCompletedRequired(thesisId, req.user.id),
    canAdminSign: isAdmin,
  });
});

app.post('/theses/:id/acta/sign-evaluator', authMiddleware, requireRole('evaluator'), upload.single('signature'), (req, res) => {
  const thesisId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'signature file required' });
  const assigned = db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);
  if (!assigned) return res.status(403).json({ error: 'not assigned' });
  if (!hasEvaluatorCompletedRequired(thesisId, req.user.id)) {
    return res.status(400).json({ error: 'Debe completar evaluación de documento y sustentación antes de firmar' });
  }

  const existing = db.prepare('SELECT id FROM acta_signatures WHERE thesis_id = ? AND signer_user_id = ? AND signer_role = ?')
    .get(thesisId, req.user.id, 'evaluator');
  const basename = path.basename(req.file.path);
  if (existing) {
    db.prepare('UPDATE acta_signatures SET file_url = ?, created_at = ? WHERE id = ?').run(basename, Date.now(), existing.id);
    return res.json({ ok: true, updated: true, file_url: `/uploads/${basename}` });
  }

  db.prepare('INSERT INTO acta_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, req.user.id, req.user.full_name || 'Evaluador', 'evaluator', basename, nowSec());

  const actDescEv = `Firma de acta cargada por evaluador: ${req.user.full_name || 'Evaluador'}`;
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'act_signature', actDescEv, 1, nowSec());
  notifyTimeline(db, thesisId, 'act_signature', actDescEv, req.user.id).catch(console.error);

  res.json({ ok: true, file_url: `/uploads/${basename}` });
});

app.post('/theses/:id/acta/sign-director', authMiddleware, requireRole('admin'), upload.single('signature'), (req, res) => {
  const thesisId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'signature file required' });

  const { director_name } = req.body;
  const thesisDirectors = db.prepare('SELECT name FROM thesis_directors WHERE thesis_id = ?').all(thesisId).map(r => r.name);
  const signerName = (director_name && director_name.trim()) || thesisDirectors[0] || req.user.full_name || 'Director Proyecto de Grado';
  const basename = path.basename(req.file.path);

  const existing = db.prepare('SELECT id FROM acta_signatures WHERE thesis_id = ? AND signer_role = ? AND signer_name = ?')
    .get(thesisId, 'director', signerName);
  if (existing) {
    db.prepare('UPDATE acta_signatures SET file_url = ?, created_at = ? WHERE id = ?').run(basename, Date.now(), existing.id);
  } else {
    db.prepare('INSERT INTO acta_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesisId, req.user.id, signerName, 'director', basename, nowSec());
  }

  const actDescDir = `Firma de director registrada en acta: ${signerName}`;
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'act_signature', actDescDir, 1, nowSec());
  notifyTimeline(db, thesisId, 'act_signature', actDescDir, req.user.id).catch(console.error);

  res.json({ ok: true, file_url: `/uploads/${basename}`, signer_name: signerName });
});

app.post('/theses/:id/acta/sign-program-director', authMiddleware, requireRole('admin'), upload.single('signature'), (req, res) => {
  const thesisId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'signature file required' });

  const { program_director_name } = req.body;
  const signerName = (program_director_name && program_director_name.trim()) || req.user.full_name || 'Director del Programa';
  const basename = path.basename(req.file.path);

  const existing = db.prepare('SELECT id FROM acta_signatures WHERE thesis_id = ? AND signer_role = ?')
    .get(thesisId, 'program_director');
  if (existing) {
    db.prepare('UPDATE acta_signatures SET signer_name = ?, file_url = ?, created_at = ? WHERE id = ?')
      .run(signerName, basename, Date.now(), existing.id);
  } else {
    db.prepare('INSERT INTO acta_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), thesisId, req.user.id, signerName, 'program_director', basename, nowSec());
  }

  const actDescPD = `Firma de Director del Programa registrada en acta: ${signerName}`;
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'act_signature', actDescPD, 1, nowSec());
  notifyTimeline(db, thesisId, 'act_signature', actDescPD, req.user.id).catch(console.error);

  res.json({ ok: true, file_url: `/uploads/${basename}`, signer_name: signerName });
});

// ============================================================================
// FIRMA DIGITAL CON CERTIFICADO - ENDPOINTS
// ============================================================================

// Eliminar una firma digital (admin)
app.post('/theses/:id/acta/delete-signature', authMiddleware, requireRole('admin'), (req, res) => {
  const thesisId = req.params.id;
  const { signer_name, signer_role } = req.body;
  if (!signer_name) return res.status(400).json({ error: 'signer_name requerido' });
  db.prepare('DELETE FROM digital_signatures WHERE thesis_id = ? AND signer_name = ? AND signer_role = ?')
    .run(thesisId, signer_name, signer_role);
  db.prepare('UPDATE signing_tokens SET used_at = NULL WHERE thesis_id = ? AND signer_name = ?')
    .run(thesisId, signer_name);
  res.json({ ok: true });
});

// Obtener estado de firma digital del acta
app.get('/theses/:id/acta/digital-signature-status', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  // Obtener el acta firmada actual
  const signedActa = db.prepare('SELECT * FROM signed_actas WHERE thesis_id = ? ORDER BY version DESC LIMIT 1').get(thesisId);
  
  // Obtener firmas digitales registradas
  const digitalSigs = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ? ORDER BY signed_at ASC').all(thesisId);

  console.log('DEBUG digital-signature-status:');
  console.log('  evaluators:', ctx.evaluators.map(e => ({ id: e.id, name: e.name })));
  console.log('  directors:', ctx.directors);
  console.log('  digitalSigs:', digitalSigs.map(s => ({ user_id: s.signer_user_id, role: s.signer_role, name: s.signer_name })));

  // Determinar quiénes deben firmar
  const requiredSigners = [
    ...ctx.evaluators.map(e => ({ user_id: e.id, name: e.name, role: 'evaluator' })),
    ...ctx.directors.map(d => ({ user_id: null, name: d, role: 'director' })),
    { user_id: null, name: 'Director del Programa', role: 'program_director' }
  ];

  // Determinar quiénes ya firmaron
  const signedBy = digitalSigs.map(s => ({
    signer_name: s.signer_name,
    signer_role: s.signer_role,
    signed_at: s.signed_at,
    certificate_cn: s.certificate_cn,
    signature_valid: s.signature_valid
  }));

  // Strip academic title prefixes for name matching
  const titlePrefixes = ['profesional', 'esp.', 'mg.', 'phd.', 'dr.'];
  const stripTitle = (name) => {
    if (!name) return '';
    let n = name.trim().toLowerCase();
    for (const t of titlePrefixes) {
      if (n.startsWith(t + ' ')) { n = n.slice(t.length + 1).trim(); break; }
    }
    return n;
  };
  // Determinar quiénes faltan
  const pendingSigners = requiredSigners.filter(r => {
    if (r.role === 'evaluator') {
      const found = digitalSigs.some(ds =>
        (ds.signer_role === 'evaluator' || ds.signer_role === 'evaluador' || ds.signer_role === null) &&
        ((ds.signer_user_id && String(ds.signer_user_id) === String(r.user_id)) ||
         stripTitle(ds.signer_name) === stripTitle(r.name) ||
         ds.signer_name.toLowerCase() === r.name.toLowerCase())
      );
      return !found;
    } else if (r.role === 'director') {
      const found = digitalSigs.some(ds =>
        (stripTitle(ds.signer_name) === stripTitle(r.name) ||
         ds.signer_name.toLowerCase() === r.name.toLowerCase()) &&
        (ds.signer_role === 'director' || ds.signer_role === null)
      );
      return !found;
    } else {
      const found = digitalSigs.some(ds =>
        ds.signer_role === 'program_director' ||
        (ds.signer_role === null && ds.signer_name.toLowerCase() === 'director del programa')
      );
      return !found;
    }
  });

  const allSigned = pendingSigners.length === 0 && requiredSigners.length > 0;
  console.log('  pendingSigners:', pendingSigners);
  console.log('  allSigned:', allSigned);

  res.json({
    signedActa,
    digitalSignatures: signedBy,
    requiredSigners,
    pendingSigners,
    allSigned,
    currentPdfUrl: (signedActa && signedActa.current_pdf_url) ? `/uploads/${path.basename(signedActa.current_pdf_url)}` : null
  });
});

// Generar PDF con campos de firma para descargar
app.get('/theses/:id/acta/download-for-signing', authMiddleware, async (req, res) => {
  const thesisId = req.params.id;
  const progDirectorNameParam = req.query.prog_director_name || '';

  console.log('📋 Parámetro prog_director_name recibido:', JSON.stringify(progDirectorNameParam));

  // Headers para evitar caché y asegurar que se descargue el último PDF
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  // Siempre regenerar el PDF para asegurar que tenga los datos más recientes
  // No usar cache para garantizar que cada descarga sea la versión actual

  // Generar nuevo PDF base desde el template DOCX
  const { thesis, students, evaluators, directors, weighted, programName, signatures, programDirectors } = ctx;
  const classification = scoreClassification(weighted.finalScore);
  
  const studentNames = students.map(s => s.name).join(', ');
  const studentCodes = students.map(s => s.student_code || '').filter(Boolean).join(', ');
  const studentIds = students.map(s => s.cedula || '').filter(Boolean).join(', ');
  const evalNames = evaluators.map(e => e.name).join(', ');
  const directorNames = directors.join(', ');

  const defenseDate = thesis.defense_date ? new Date(Number(thesis.defense_date)) : new Date();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dateText = `${defenseDate.getDate()} de ${months[defenseDate.getMonth()]} de ${defenseDate.getFullYear()}`;
  const timeText = defenseDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  try {
    let pdfBuffer;

    {
      // Calcular año, período y consecutivo
      const defenseYear = defenseDate.getFullYear();
      const defenseMonth = defenseDate.getMonth() + 1;
      const defensePeriod = defenseMonth >= 7 ? 'II' : 'I';

      const periodStart = defensePeriod === 'I'
        ? new Date(defenseYear, 0, 1).getTime()
        : new Date(defenseYear, 6, 1).getTime();
      const periodEnd = defensePeriod === 'I'
        ? new Date(defenseYear, 6, 1).getTime()
        : new Date(defenseYear + 1, 0, 1).getTime();
      const thesesInPeriod = db.prepare(
        `SELECT id FROM theses WHERE defense_date IS NOT NULL AND CAST(defense_date AS INTEGER) >= ? AND CAST(defense_date AS INTEGER) < ? ORDER BY CAST(defense_date AS INTEGER) ASC`
      ).all(periodStart, periodEnd);
      let thesisPos = 1;
      for (let i = 0; i < thesesInPeriod.length; i++) { if (thesesInPeriod[i].id === thesis.id) { thesisPos = i + 1; break; } }
      const thesisNumber = String(thesisPos).padStart(2, '0');

      // Helpers para texto de números
      function numToText(n) {
        const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
        const teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
        const tens2 = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
        if (n < 10) return units[n];
        if (n < 20) return teens[n - 10];
        const t = Math.floor(n / 10), u = n % 10;
        if (u === 0) return tens2[t];
        if (t === 2) return 'veinti' + units[u];
        return tens2[t] + ' y ' + units[u];
      }
      function numToTextYear(n) {
        if (n < 1000) return numToText(n);
        const th = Math.floor(n / 1000), rest = n % 1000;
        const thW = th === 1 ? 'mil' : numToText(th) + ' mil';
        return rest === 0 ? thW : thW + ' ' + numToText(rest);
      }

      // Directores de programa (incluye param manual si se pasa)
      const effectiveProgramDirectors = progDirectorNameParam
        ? [{ name: progDirectorNameParam, program: programDirectors[0]?.program || programName || 'Programa Académico', id: null }, ...programDirectors.slice(1)]
        : programDirectors;

      // Merge signing_tokens + digital_signatures to get names with titles
      const sigTokens = db.prepare('SELECT signer_name, signer_role FROM signing_tokens WHERE thesis_id = ?').all(thesisId);
      const digSigs = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ?').all(thesisId);
      const mergedSignatures = digSigs.length > 0 ? digSigs : [...signatures, ...sigTokens];

      const docxBuf = generateActaDocx({
        thesisNumber,
        year: defenseYear,
        period: defensePeriod,
        lugar: thesis.defense_location || 'Auditorio por definir',
        hora: timeText,
        dia_numero: defenseDate.getDate(),
        dia_texto: numToText(defenseDate.getDate()),
        mes_nombre: months[defenseDate.getMonth()],
        year_text: `${defenseYear} (${numToTextYear(defenseYear)})`,
        titulo: thesis.title || '',
        estudiantes: studentNames,
        codigos: studentCodes || 'N/A',
        director: directorNames,
        evaluadores: evalNames,
        observaciones: thesis.defense_info || 'Sin observaciones registradas',
        classification,
        nota: Number(weighted.finalScore || 0).toFixed(1),
        calificacion_letras: scoreToSpanishText(weighted.finalScore),
        evaluators,
        directors,
        programDirectors: effectiveProgramDirectors,
        signatures: mergedSignatures,
        programName,
      });

      // Convertir a PDF usando LibreOffice
      const { execSync } = require('child_process');
      const tmpDocx = path.join('/tmp', `acta_sign_${thesisId}_${Date.now()}.docx`);
      fs.writeFileSync(tmpDocx, docxBuf);
      console.log('Wrote temporary DOCX for signing:', tmpDocx, 'size=', fs.statSync(tmpDocx).size);

      let conversionOutput = '';
      try {
        conversionOutput = execSync(`libreoffice --headless --convert-to 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"1"}}' --outdir /tmp "${tmpDocx}"`, {
          timeout: 300000,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err) {
        console.error('LibreOffice conversion failed:', err);
        if (err.stdout) console.error('LibreOffice stdout:', err.stdout.toString());
        if (err.stderr) console.error('LibreOffice stderr:', err.stderr.toString());
        throw err;
      }

      const tmpPdf = tmpDocx.replace(/\.docx$/, '.pdf');
      console.log('Expecting PDF at', tmpPdf);
      if (!fs.existsSync(tmpPdf)) {
        console.error('LibreOffice conversion output was empty, conversionOutput:', conversionOutput);
        try { console.log('Tmp dir listing:', fs.readdirSync('/tmp').filter(f => f.startsWith('acta_sign_')).slice(0,10)); } catch (e) {}
        throw new Error('LibreOffice no generó el PDF');
      }
      pdfBuffer = fs.readFileSync(tmpPdf);
      try { fs.unlinkSync(tmpDocx); } catch {}
      try { fs.unlinkSync(tmpPdf); } catch {}
    }

    // Guardar el PDF generado
    const pdfFilename = `acta_digital_${thesisId}_${Date.now()}.pdf`;
    const pdfPath = path.join(uploadDir, pdfFilename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Crear registro en signed_actas
    const actaId = uuidv4();
    db.prepare('INSERT INTO signed_actas (id, thesis_id, current_pdf_url, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(actaId, thesisId, pdfFilename, 1, 'pending', Date.now(), nowSec());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acta-${thesisId}-para-firmar.pdf"`);
    return res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generando PDF para firma:', error);
    return res.status(500).json({ error: 'Error generando PDF' });
  }
});

// Subir PDF firmado digitalmente
app.post('/theses/:id/acta/upload-signed', authMiddleware, upload.fields([{ name: 'signed_pdf', maxCount: 1 }, { name: 'signature_image', maxCount: 1 }]), async (req, res) => {
  const thesisId = req.params.id;
  const { signer_name, signer_role } = req.body;

  const pdfFile = req.files && req.files.signed_pdf && req.files.signed_pdf[0];
  if (!pdfFile) return res.status(400).json({ error: 'Se requiere el archivo PDF firmado' });
  if (!signer_role) return res.status(400).json({ error: 'Se requiere el rol del firmante' });

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'Tesis no encontrada' });

  // Determinar el nombre del firmante
  let signerName = signer_name;
  if (!signerName) {
    if (signer_role === 'evaluator') {
      signerName = req.user.full_name || 'Evaluador';
    } else if (signer_role === 'director') {
      signerName = ctx.directors[0] || req.user.full_name || 'Director';
    } else {
      signerName = req.user.full_name || 'Director del Programa';
    }
  }

  // Verificar que no haya firmado ya (strip title for matching)
  const allSigsForThesis = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ? AND signer_role = ?').all(thesisId, signer_role);
  const _tp = ['profesional','esp.','mg.','phd.','dr.'];
  const _sn = (n) => { if (!n) return ''; let s = n.trim().toLowerCase(); for (const t of _tp) { if (s.startsWith(t + ' ')) { s = s.slice(t.length + 1).trim(); break; } } return s; };
  const existingSig = allSigsForThesis.find(ds =>
    ds.signer_user_id === req.user.id ||
    _sn(ds.signer_name) === _sn(signerName) ||
    ds.signer_name === signerName
  );

  if (existingSig) {
    return res.status(400).json({ error: 'Ya has firmado este documento' });
  }

  // Save signature image (canvas drawing or uploaded image)
  const signatureImageUrl = saveSignatureImage(req, signerName);

  // Obtener o crear el registro del acta
  let signedActa = db.prepare('SELECT * FROM signed_actas WHERE thesis_id = ? ORDER BY version DESC LIMIT 1').get(thesisId);

  if (!signedActa) {
    const actaId = uuidv4();
    db.prepare('INSERT INTO signed_actas (id, thesis_id, current_pdf_url, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(actaId, thesisId, path.basename(pdfFile.path), 1, 'in_progress', Date.now(), nowSec());
    signedActa = { id: actaId };
  } else {
    db.prepare('UPDATE signed_actas SET current_pdf_url = ?, updated_at = ? WHERE id = ?')
      .run(path.basename(pdfFile.path), Date.now(), signedActa.id);
  }

  // Registrar la firma digital
  const sigId = uuidv4();
  db.prepare(`
    INSERT INTO digital_signatures (id, signed_acta_id, thesis_id, signer_user_id, signer_name, signer_role, signed_at, signature_valid, created_at, pdf_url, signature_image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sigId, signedActa.id, thesisId, req.user.id, signerName, signer_role, Date.now(), 1, nowSec(), `/uploads/${path.basename(pdfFile.path)}`, signatureImageUrl);

  // Registrar en timeline
  db.prepare('INSERT INTO thesis_timeline (id, thesis_id, event_type, description, completed, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, 'digital_signature', `Firma digital registrada: ${signerName} (${signer_role})`, 1, nowSec());

  // Verificar si todas las firmas están completas
  const digitalSigs = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ?').all(thesisId);
  const evalSigned = ctx.evaluators.every(e => digitalSigs.some(ds => (ds.signer_user_id === e.id || _sn(ds.signer_name) === _sn(e.name)) && (ds.signer_role === 'evaluator' || ds.signer_role === 'evaluador')));
  const dirSigned = ctx.directors.every(d => digitalSigs.some(ds => (_sn(ds.signer_name) === _sn(d) || ds.signer_name.toLowerCase() === d.toLowerCase()) && ds.signer_role === 'director'));
  const progDirSigned = digitalSigs.some(ds => ds.signer_role === 'program_director');

  const allSigned = evalSigned && dirSigned && progDirSigned;

  if (allSigned) {
    db.prepare('UPDATE signed_actas SET status = ?, updated_at = ? WHERE id = ?')
      .run('completed', Date.now(), signedActa.id);
  }

  res.json({
    ok: true,
    message: 'Firma digital registrada correctamente',
    signer_name: signerName,
    signer_role,
    all_signed: allSigned,
    pdf_url: `/uploads/${path.basename(pdfFile.path)}`
  });
});

// Descargar el PDF final con todas las firmas
app.get('/theses/:id/acta/download-final-signed', authMiddleware, async (req, res) => {
  const thesisId = req.params.id;

  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  const isEvaluator = !!db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);
  const isDirector = !!db.prepare('SELECT 1 FROM thesis_directors WHERE thesis_id = ? AND name = (SELECT full_name FROM users WHERE id = ?)').get(thesisId, req.user.id);

  if (!isAdmin && !isEvaluator && !isDirector) {
    return res.status(403).json({ error: 'No tiene permisos para descargar' });
  }

  // Servir el último PDF subido por cualquier firmante (cadena de firmas)
  const signedActa = db.prepare('SELECT * FROM signed_actas WHERE thesis_id = ? ORDER BY updated_at DESC LIMIT 1').get(thesisId);
  if (signedActa && signedActa.current_pdf_url) {
    const pdfPath = path.join(uploadDir, path.basename(signedActa.current_pdf_url));
    if (fs.existsSync(pdfPath)) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="acta-final-firmada-${thesisId}.pdf"`);
      return res.sendFile(pdfPath);
    }
  }

  // Si no hay signed_acta completado, generar el acta como PDF dinámicamente
  try {
    const ctx = getActaContext(thesisId);
    if (!ctx) return res.status(404).json({ error: 'Tesis no encontrada' });

    const { thesis, students, evaluators, directors, weighted, programName, programDirectors } = ctx;
    // Usar digital_signatures (token-based) como fuente de firmas para el PDF final
    const digitalSigs = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ?').all(thesisId);
    const sigTokensFinal = db.prepare('SELECT signer_name, signer_role FROM signing_tokens WHERE thesis_id = ?').all(thesisId);
    const signatures = digitalSigs.length > 0 ? digitalSigs : [...ctx.signatures, ...sigTokensFinal];
    const defenseDate = thesis.defense_date ? new Date(Number(thesis.defense_date)) : new Date();
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const timeText = defenseDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const defenseYear = defenseDate.getFullYear();
    const defenseMonth = defenseDate.getMonth() + 1;
    const defensePeriod = defenseMonth >= 7 ? 'II' : 'I';
    const periodStart = defensePeriod === 'I' ? new Date(defenseYear,0,1).getTime() : new Date(defenseYear,6,1).getTime();
    const periodEnd   = defensePeriod === 'I' ? new Date(defenseYear,6,1).getTime() : new Date(defenseYear+1,0,1).getTime();
    const thesesInPeriod = db.prepare(`SELECT id FROM theses WHERE defense_date IS NOT NULL AND CAST(defense_date AS INTEGER) >= ? AND CAST(defense_date AS INTEGER) < ? ORDER BY CAST(defense_date AS INTEGER) ASC`).all(periodStart, periodEnd);
    let thesisPos = 1;
    for (let i = 0; i < thesesInPeriod.length; i++) { if (thesesInPeriod[i].id === thesis.id) { thesisPos = i+1; break; } }
    const thesisNumber = String(thesisPos).padStart(2, '0');
    function numToText(n) {
      const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
      const teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
      const tens2 = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
      if (n < 10) return units[n]; if (n < 20) return teens[n-10];
      const t = Math.floor(n/10), u = n%10;
      if (u === 0) return tens2[t]; if (t === 2) return 'veinti'+units[u];
      return tens2[t]+' y '+units[u];
    }
    function numToTextYear(n) {
      if (n < 1000) return numToText(n);
      const th = Math.floor(n/1000), rest = n%1000;
      const thW = th === 1 ? 'mil' : numToText(th)+' mil';
      return rest === 0 ? thW : thW+' '+numToText(rest);
    }

    const docxBuf = generateActaDocx({
      thesisNumber, year: defenseYear, period: defensePeriod,
      lugar: thesis.defense_location || 'Auditorio por definir',
      hora: timeText,
      dia_numero: defenseDate.getDate(),
      dia_texto: numToText(defenseDate.getDate()),
      mes_nombre: months[defenseDate.getMonth()],
      year_text: `${defenseYear} (${numToTextYear(defenseYear)})`,
      titulo: thesis.title || '',
      estudiantes: students.map(s => s.name).join(', '),
      codigos: students.map(s => s.student_code || '').filter(Boolean).join(', ') || 'N/A',
      director: directors.join(', '),
      evaluadores: evaluators.map(e => e.name).join(', '),
      observaciones: thesis.defense_info || 'Sin observaciones registradas',
      classification: scoreClassification(weighted.finalScore),
      nota: Number(weighted.finalScore || 0).toFixed(1),
      calificacion_letras: scoreToSpanishText(weighted.finalScore),
      evaluators, directors, programDirectors, signatures, programName,
    });

    const { execSync } = require('child_process');
    const tmpDocx = path.join('/tmp', `acta_final_${thesisId}_${Date.now()}.docx`);
    fs.writeFileSync(tmpDocx, docxBuf);
    execSync(`libreoffice --headless --convert-to pdf --outdir /tmp "${tmpDocx}"`, { timeout: 30000, stdio: 'pipe' });
    const tmpPdf = tmpDocx.replace(/\.docx$/, '.pdf');
    const pdfBuffer = fs.readFileSync(tmpPdf);
    try { fs.unlinkSync(tmpDocx); } catch {}
    try { fs.unlinkSync(tmpPdf); } catch {}

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acta-final-firmada-${thesisId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('Error generando PDF final:', e);
    return res.status(500).json({ error: 'Error generando PDF' });
  }
});

// ============================================================================

app.get('/theses/:id/acta/export', authMiddleware, async (req, res) => {
  const thesisId = req.params.id;
  const format = (req.query.format || 'word').toString().toLowerCase();

  // Verificar permisos: admin puede siempre, evaluador solo PDF cuando todas las firmas están completas
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  const isEvaluator = !!db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);

  if (!isAdmin && !isEvaluator) {
    return res.status(403).json({ error: 'No tiene permisos para exportar' });
  }

  const ctx = getActaContext(thesisId);
  console.log('EXPORT ACTA ENDPOINT:', { thesisId, format });
  if (!ctx) return res.status(404).json({ error: 'not found' });

  // Si es evaluador (no admin), solo puede descargar PDF y solo cuando todas las firmas están
  if (!isAdmin && isEvaluator) {
    if (format !== 'pdf') {
      return res.status(403).json({ error: 'Solo puede descargar en formato PDF' });
    }
    const evalSigs = ctx.signatures.filter(s => s.signer_role === 'evaluator');
    const dirSigs = ctx.signatures.filter(s => s.signer_role === 'director');
    const progSig = ctx.signatures.find(s => s.signer_role === 'program_director');
    const _tp3 = ['profesional','esp.','mg.','phd.','dr.'];
    const _sn3 = (n) => { if (!n) return ''; let s = n.trim().toLowerCase(); for (const t of _tp3) { if (s.startsWith(t + ' ')) { s = s.slice(t.length + 1).trim(); break; } } return s; };
    const allEvalSigned = ctx.evaluators.length > 0 && ctx.evaluators.every(ev => evalSigs.some(s => String(s.signer_user_id) === String(ev.id) || _sn3(s.signer_name) === _sn3(ev.name)));
    const allDirSigned = ctx.directors.length > 0 && ctx.directors.every(d => dirSigs.some(s => _sn3(s.signer_name) === _sn3(d) || s.signer_name.toLowerCase() === d.toLowerCase()));
    const allSigned = allEvalSigned && allDirSigned && !!progSig;
    if (!allSigned) {
      return res.status(403).json({ error: 'El acta aún no tiene todas las firmas completas' });
    }
  }

  const { thesis, students, evaluators, directors, signatures: oldSignatures, weighted, programName, programDirectors } = ctx;

  // Usar firmas digitales si existen, de lo contrario caer en las antiguas + signing_tokens (para títulos)
  const digitalSigsRaw = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ? ORDER BY signed_at ASC').all(thesisId);
  const sigTokensExport = db.prepare('SELECT signer_name, signer_role FROM signing_tokens WHERE thesis_id = ?').all(thesisId);
  const signatures = digitalSigsRaw.length > 0
    ? digitalSigsRaw.map(s => ({ ...s, file_url: null, created_at: s.signed_at }))
    : [...oldSignatures, ...sigTokensExport];
  const classification = scoreClassification(weighted.finalScore);
  const mark = (label) => (classification === label ? 'X' : ' ');

  const studentNames = students.map(s => s.name).join(', ');
  const studentCodes = students.map(s => s.student_code || '').filter(Boolean).join(', ');
  const studentIds = students.map(s => s.cedula || '').filter(Boolean).join(', ');
  const evalNames = evaluators.map(e => e.name).join(', ');
  const directorNames = directors.join(', ');
  
  // Obtener la firma del director del programa
  const programDirectorSig = signatures.find(s => s.signer_role === 'program_director');

  // Preparar datos para el template
  const defenseDate = thesis.defense_date ? new Date(Number(thesis.defense_date)) : new Date();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dateText = `${defenseDate.getDate()} de ${months[defenseDate.getMonth()]} de ${defenseDate.getFullYear()}`;
  const timeText = defenseDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  
  // Calcular año, período y consecutivo
  const defenseYear = defenseDate.getFullYear();
  const defenseMonth = defenseDate.getMonth() + 1;
  const defensePeriod = defenseMonth >= 7 ? 'II' : 'I';
  const periodStart2 = defensePeriod === 'I' ? new Date(defenseYear, 0, 1).getTime() : new Date(defenseYear, 6, 1).getTime();
  const periodEnd2 = defensePeriod === 'I' ? new Date(defenseYear, 6, 1).getTime() : new Date(defenseYear + 1, 0, 1).getTime();
  const thesesInPeriod2 = db.prepare(`SELECT id FROM theses WHERE defense_date IS NOT NULL AND CAST(defense_date AS INTEGER) >= ? AND CAST(defense_date AS INTEGER) < ? ORDER BY CAST(defense_date AS INTEGER) ASC`).all(periodStart2, periodEnd2);
  let thesisPos2 = 1;
  for (let i = 0; i < thesesInPeriod2.length; i++) { if (thesesInPeriod2[i].id === thesis.id) { thesisPos2 = i + 1; break; } }
  const thesisNumber2 = String(thesisPos2).padStart(2, '0');

  function numToText2(n) {
    const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
    const teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
    const tens2 = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return tens2[t];
    if (t === 2) return 'veinti' + units[u];
    return tens2[t] + ' y ' + units[u];
  }
  function numToTextYear2(n) {
    if (n < 1000) return numToText2(n);
    const th = Math.floor(n / 1000), rest = n % 1000;
    const thW = th === 1 ? 'mil' : numToText2(th) + ' mil';
    return rest === 0 ? thW : thW + ' ' + numToText2(rest);
  }

  try {
    const buf = generateActaDocx({
      thesisNumber: thesisNumber2,
      year: defenseYear,
      period: defensePeriod,
      lugar: thesis.defense_location || 'Auditorio por definir',
      hora: timeText,
      dia_numero: defenseDate.getDate(),
      dia_texto: numToText2(defenseDate.getDate()),
      mes_nombre: months[defenseDate.getMonth()],
      year_text: `${defenseYear} (${numToTextYear2(defenseYear)})`,
      titulo: thesis.title || '',
      estudiantes: studentNames,
      codigos: studentCodes || 'N/A',
      director: directorNames,
      evaluadores: evalNames,
      observaciones: thesis.defense_info || 'Sin observaciones registradas',
      classification,
      nota: Number(weighted.finalScore || 0).toFixed(1),
      calificacion_letras: scoreToSpanishText(weighted.finalScore),
      evaluators,
      directors,
      programDirectors,
      signatures,
      programName,
    });

    const studentFileNames = students.map(s => {
      const parts = (s.name || '').trim().split(/\s+/);
      return parts.length >= 3 ? parts[0] + parts[Math.ceil(parts.length / 2)] : parts.join('');
    }).join('-');
    const baseFileName = `${thesisNumber2}-${defenseYear}-${defensePeriod}-${studentFileNames}`;

    if (format === 'pdf') {
      const { execSync } = require('child_process');
      const tmpDocx = path.join('/tmp', `acta_${thesisId}_${Date.now()}.docx`);
      fs.writeFileSync(tmpDocx, buf);
      try {
        const conversion = execSync(`libreoffice --headless --convert-to 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"1"}}' --outdir /tmp "${tmpDocx}"`, { timeout: 30000, stdio: 'pipe' });
        const tmpPdf = tmpDocx.replace(/\.docx$/, '.pdf');
        if (!fs.existsSync(tmpPdf)) throw new Error('LibreOffice no generó el PDF');
        const pdfBuf = fs.readFileSync(tmpPdf);
        try { fs.unlinkSync(tmpDocx); } catch {}
        try { fs.unlinkSync(tmpPdf); } catch {}

        const stamped = await overlayHeaderFooterOnPdf(pdfBuf);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stamped.length);
        res.setHeader('Content-Disposition', `attachment; filename="${baseFileName}.pdf"`);
        return res.send(stamped);
      } catch (convErr) {
        console.error('Error convirtiendo a PDF:', convErr.message);
        if (convErr.stdout) console.error('stdout:', convErr.stdout.toString());
        if (convErr.stderr) console.error('stderr:', convErr.stderr.toString());
        try { fs.unlinkSync(tmpDocx); } catch {}
        return res.status(500).json({ error: 'Error al convertir a PDF' });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${baseFileName}.docx"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error generando acta:', error);
    return res.status(500).json({ error: 'Error generando acta' });
  }
});

// File uploads for evaluations
app.post('/evaluations/:id/files', authMiddleware, upload.single('file'), (req, res) => {
  const evaluation_id = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const id = uuidv4();
  const uploaded_at = Date.now();
  const file_name = req.file.originalname;
  const basename = path.basename(req.file.path);
  db.prepare('INSERT INTO evaluation_files (id, evaluation_id, file_name, file_url, uploaded_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, evaluation_id, file_name, basename, uploaded_at);
  res.json({ id, file_name, file_url: `/uploads/${basename}`, uploaded_at });
});

// Serve uploaded files
app.get('/uploads/:file', (req, res) => {
  const file = req.params.file;
  const p = path.join(uploadDir, file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  res.sendFile(p);
});

// ============================================================================
// CARTA MERITORIA
// ============================================================================

function escapeXmlChar(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Función auxiliar para convertir DOCX a PDF
// Simplemente empaqueta el DOCX como un PDF usando pdf-lib
async function convertDocxToPdf(docxBuffer, filePrefix = 'docx') {
  const tmpDir = '/tmp';
  const tmpDocx = path.join(tmpDir, `${filePrefix}-${Date.now()}.docx`);
  const baseName = path.basename(tmpDocx, '.docx');
  const tmpPdf = path.join(tmpDir, `${baseName}.pdf`);

  try {
    // Guardar el DOCX temporalmente
    fs.writeFileSync(tmpDocx, docxBuffer);

    // Convertir a PDF usando LibreOffice
    console.log(`Convirtiendo ${tmpDocx} a PDF...`);
    const { execSync } = require('child_process');
    execSync(`libreoffice --headless --convert-to 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"1"}}' --outdir /tmp "${tmpDocx}"`, {
      timeout: 30000,
      stdio: 'pipe'
    });

    if (!fs.existsSync(tmpPdf)) {
      throw new Error('LibreOffice no generó el PDF');
    }

    const pdfBuffer = fs.readFileSync(tmpPdf);

    // Limpiar archivos temporales
    try {
      fs.unlinkSync(tmpDocx);
      fs.unlinkSync(tmpPdf);
    } catch (cleanupErr) {
      console.warn('Error limpiando archivos temporales:', cleanupErr.message);
    }

    console.log(`✅ PDF generado exitosamente: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
  } catch (err) {
    console.error(`❌ Error en convertDocxToPdf: ${err.message}`);
    console.error(`Stack: ${err.stack}`);

    // Limpiar archivos temporales en caso de error
    try {
      if (fs.existsSync(tmpDocx)) fs.unlinkSync(tmpDocx);
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    } catch (cleanupErr) {
      console.warn('Error limpiando archivos temporales en error:', cleanupErr.message);
    }

    throw err;
  }
}

async function overlayHeaderFooterOnPdf(pdfBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const headerPath = path.join(__dirname, 'Formatos', 'header.png');
    const footerPath = path.join(__dirname, 'Formatos', 'footer.png');

    if (!fs.existsSync(headerPath) || !fs.existsSync(footerPath)) {
      return pdfBuffer;
    }

    const headerImg = await pdfDoc.embedPng(fs.readFileSync(headerPath));
    const footerImg = await pdfDoc.embedPng(fs.readFileSync(footerPath));

    const pages = pdfDoc.getPages();
    pages.forEach((page) => {
      const { width, height } = page.getSize();
      // Scale header and footer to fill page width (with minimal margin)
      const headerScale = Math.min((width * 0.98) / headerImg.width, 1);
      const footerScale = Math.min((width * 0.98) / footerImg.width, 1);

      const headerWidth = headerImg.width * headerScale;
      const headerHeight = headerImg.height * headerScale;
      const footerWidth = footerImg.width * footerScale;
      const footerHeight = footerImg.height * footerScale;

      // Skip drawing the header image to avoid embedding fixed text from the template.
      // The header image (header.png) currently contains "DEPARTAMENTO DE CIENCIAS Y TECNOLOGÍAS DE LA INFORMACIÓN".
      // We still draw the footer but omit the header overlay.
      const footerX = (width - footerWidth) / 2;
      const footerY = 10; // Footer at bottom

      page.drawImage(footerImg, { x: footerX, y: footerY, width: footerWidth, height: footerHeight });
    });

    return Buffer.from(await pdfDoc.save());
  } catch (err) {
    console.warn('overlayHeaderFooterOnPdf failed:', err);
    return pdfBuffer;
  }
}

function generateActaDocx({
  thesisNumber, year, period, lugar, hora, dia_numero, dia_texto, mes_nombre, year_text,
  titulo, estudiantes, codigos, director, evaluadores, observaciones,
  classification, nota, calificacion_letras,
  evaluators, directors, programDirectors, signatures, programName,
}) {
  // Usar generación completa dinámicamente para asegurar que todos los datos aparezcan
  return generateActaDocxLegacy({
    thesisNumber, year, period, lugar, hora, dia_numero, dia_texto, mes_nombre, year_text,
    titulo, estudiantes, codigos, director, evaluadores, observaciones,
    classification, nota, calificacion_letras,
    evaluators, directors, programDirectors, signatures, programName,
  });
}

function generateActaDocxLegacy({
  thesisNumber, year, period, lugar, hora, dia_numero, dia_texto, mes_nombre, year_text,
  titulo, estudiantes, codigos, director, evaluadores, observaciones,
  classification, nota, calificacion_letras,
  evaluators, directors, programDirectors, signatures, programName,
}) {
  function e(str) { return escapeXmlChar(str); }

  const defaultRPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const boldRPr = `<w:rPr><w:b/><w:bCs/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;

  function run(text, rPr) { return `<w:r>${rPr || defaultRPr}<w:t xml:space="preserve">${e(text)}</w:t></w:r>`; }
  function bold(text) { return run(text, boldRPr); }

  function para(runs, align) {
    const jc = align ? `<w:jc w:val="${align}"/>` : '<w:jc w:val="both"/>';
    return `<w:p><w:pPr>${jc}<w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/></w:pPr>${runs}</w:p>`;
  }
  function centerPara(runs) { return para(runs, 'center'); }
  function emptyPara() { return `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr></w:p>`; }

  // Tabla de firmas: orden específico - evaluadores, luego directores, luego directores de programa
  // Máximo 2 columnas por fila para mejor legibilidad
  const allSigners = [];

  // Strip academic title prefixes for matching signatures
  const _titlePrefixes = ['profesional', 'esp.', 'mg.', 'phd.', 'dr.'];
  const _strip = (n) => { if (!n) return ''; let s = n.trim().toLowerCase(); for (const t of _titlePrefixes) { if (s.startsWith(t + ' ')) { s = s.slice(t.length + 1).trim(); break; } } return s; };

  // 1. Jurados evaluadores
  evaluators.forEach(ev => {
    const sig = signatures.find(s => s.signer_role === 'evaluator' && (
      (s.signer_user_id && String(s.signer_user_id) === String(ev.id)) ||
      (s.signer_name && (_strip(s.signer_name) === _strip(ev.name) || s.signer_name.toLowerCase() === ev.name.toLowerCase()))
    ));
    // Use name with title from signature if available
    allSigners.push({ name: sig ? sig.signer_name : ev.name, role: 'Jurado Evaluador', sig });
  });

  // 2. Directores de proyecto
  directors.forEach((d, i) => {
    const sig = signatures.find(s => s.signer_role === 'director' && (_strip(s.signer_name) === _strip(d) || s.signer_name.toLowerCase() === d.toLowerCase()));
    allSigners.push({ name: sig ? sig.signer_name : d, role: 'Director de Proyecto de Grado', sig });
  });

  // 3. Directores de programa
  // Obtener todas las firmas de program_director (puede haber solo una)
  const progDirSigs = signatures.filter(s => s.signer_role === 'program_director');
  programDirectors.forEach((pd, i) => {
    const sig = progDirSigs[i] || progDirSigs[0] || null;
    allSigners.push({ name: sig ? sig.signer_name : pd.name, role: `Director del Programa de ${pd.program || programName || 'Programa Académico'}`, sig });
  });

  // Dividir signers en filas de máximo 2 columnas
  const colPerRow = 2;
  const signerRows = [];
  for (let i = 0; i < allSigners.length; i += colPerRow) {
    signerRows.push(allSigners.slice(i, i + colPerRow));
  }

  const colW = Math.floor(9360 / colPerRow);

  // Pre-cargar imágenes de firmas y asignar relIds
  const sigImgData = []; // { signer, relId, buffer, ext }
  let imgRelIdCounter = 100;
  allSigners.forEach((signer) => {
    const sigFileUrl = signer.sig && (signer.sig.pdf_url || signer.sig.file_url);
    if (sigFileUrl) {
      const imgPath = path.join(uploadDir, path.basename(sigFileUrl));
      if (fs.existsSync(imgPath)) {
        try {
          const buffer = fs.readFileSync(imgPath);
          const ext = path.extname(imgPath).toLowerCase().replace('.', '') || 'png';
          const relId = `rIdSig${imgRelIdCounter++}`;
          sigImgData.push({ signer, relId, buffer, ext });
          signer._imgRelId = relId;
          signer._imgExt = ext;
          signer._imgBuffer = buffer;
        } catch (_) {}
      }
    }
  });

  function makeImgDrawing(relId, widthEmu, heightEmu, imgIdx) {
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${imgIdx}" name="sig${imgIdx}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imgIdx}" name="sig${imgIdx}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  }

  let imgDrawingCounter = 200;

  function sigCell(signer) {
    const emptyLine = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
    let sigContent;
    if (signer._imgRelId) {
      // Imagen de firma: 5cm x 2.5cm en EMU (1cm = 360000 EMU)
      const wEmu = 1800000;
      const hEmu = 900000;
      const drawingXml = makeImgDrawing(signer._imgRelId, wEmu, hEmu, imgDrawingCounter++);
      sigContent = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr><w:r>${drawingXml}</w:r></w:p>`;
    } else {
      const sigLine = signer.sig ? e(`[Firma digital: ${signer.sig.signer_name}]`) : '________________';
      sigContent = `${emptyLine.repeat(4)}<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr>${run(sigLine)}</w:p>`;
    }
    return `<w:tc>
<w:tcPr><w:tcW w:type="dxa" w:w="${colW}"/>
  <w:tcBorders><w:top w:val="none" w:sz="0" w:space="0"/><w:left w:val="none" w:sz="0" w:space="0"/><w:bottom w:val="none" w:sz="0" w:space="0"/><w:right w:val="none" w:sz="0" w:space="0"/></w:tcBorders>
</w:tcPr>
${sigContent}
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr>${bold(signer.name)}</w:p>
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr>${run(signer.role)}</w:p>
</w:tc>`;
  }

  // Fila espaciadora entre grupos de firmantes
  const spacerRow = `<w:tr>
<w:trPr><w:trHeight w:val="400" w:hRule="exact"/></w:trPr>
${Array(colPerRow).fill(0).map(() => `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${colW}"/><w:tcBorders><w:top w:val="none" w:sz="0" w:space="0"/><w:left w:val="none" w:sz="0" w:space="0"/><w:bottom w:val="none" w:sz="0" w:space="0"/><w:right w:val="none" w:sz="0" w:space="0"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p></w:tc>`).join('')}
</w:tr>`;

  const sigTableRows = signerRows.map((row, idx) => {
    const cells = row.map(sigCell).join('');
    const emptyCell = row.length < colPerRow ? `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${colW}"/></w:tcPr><w:p/></w:tc>` : '';
    const dataRow = `<w:tr>${cells}${emptyCell}</w:tr>`;
    // Agregar fila espaciadora entre filas de firmantes (no al final)
    return idx < signerRows.length - 1 ? dataRow + '\n' + spacerRow : dataRow;
  }).join('\n');

  const sigTableXml = `<w:tbl>
<w:tblPr>
  <w:tblW w:type="dxa" w:w="9360"/>
  <w:jc w:val="center"/>
  <w:tblBorders><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>
  <w:tblLook w:val="0000"/>
</w:tblPr>
<w:tblGrid>${Array(colPerRow).fill(0).map(() => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>
${sigTableRows}
</w:tbl>`;

  const marca = (label) => classification === label ? 'X' : ' ';

  const bodyXml = [
    centerPara(bold('FACULTAD DE INGENIERÍA')),
    centerPara(bold(`PROGRAMA ACADÉMICO DE ${e(programName.toUpperCase())}`)),
    emptyPara(),
    centerPara(bold(`ACTA DE SUSTENTACIÓN DE PROYECTO DE GRADO No. ${e(thesisNumber)} / ${year}-${period}`)),
    emptyPara(),
    para(
      run('En ') + bold(e(lugar)) + run(', del Campus de la Universidad de San Buenaventura Cali, a las ') +
      bold(e(hora)) + run(' del día ') + bold(`${dia_numero}`) + run(` de `) + bold(e(mes_nombre.trim())) +
      run(` de `) + bold(e(year_text)) + run(', se dio inicio a la sustentación pública del proyecto de grado titulado ') +
      bold(e(titulo)) + run(`, realizado por el/los estudiante(s) `) + bold(e(estudiantes)) +
      run(`, con código(s) ${e(codigos)}. El trabajo se adelantó bajo la dirección y orientación de `) +
      bold(e(director)) + run(', mientras que la fase de evaluación contó con el apoyo de los profesores ') +
      bold(e(evaluadores)) + run('.')
    ),
    emptyPara(),
    para(bold('OBSERVACIONES: ') + run('Posterior a la revisión del documento y a la sustentación del proyecto, se realizan las siguientes observaciones, por parte del jurado evaluador:')),
    para(run(e(observaciones || 'Sin observaciones registradas.'))),
    emptyPara(),
    centerPara(bold('CALIFICACIÓN DE PROYECTO DE GRADO')),
    para(run('Marque con una "X" el ítem correspondiente a la calificación asignada.'), 'left'),
    emptyPara(),
    para(run(`APROBADA LAUREADA ( ${marca('APROBADA LAUREADA')} )`), 'left'),
    para(run(`APROBADA MERITORIA ( ${marca('APROBADA MERITORIA')} )`), 'left'),
    para(run(`APROBADA ( ${marca('APROBADA')} )`), 'left'),
    para(run(`APROBADA CON MODIFICACIONES ( ${marca('APROBADA CON MODIFICACIONES')} )`), 'left'),
    para(run(`NO APROBADA ( ${marca('NO APROBADA')} )`), 'left'),
    emptyPara(),
    para(bold('EVALUACIÓN EN LETRAS: ') + run(`${e(calificacion_letras)} (${nota})`)),
    emptyPara(),
    para(run(`Para constancia se firma en Cali, a los `) + bold(`${dia_texto} (${dia_numero})`) + run(` días del mes de `) + bold(e(mes_nombre.trim())) + run(` del año `) + bold(e(year_text)) + run('.')),
    emptyPara(),
    sigTableXml,
  ].join('\n');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>
${bodyXml}
<w:sectPr>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="2040" w:right="1440" w:bottom="1960" w:left="1440" w:header="730" w:footer="1777" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;

  // Setup temporal variables for header/footer relationships (se llenan más abajo)
  let headerRelId = null;
  let footerRelId = null;

  let updatedDocumentXml = documentXml;

  const headerXml = headerRelId ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r>
      ${makeImgDrawing(headerRelId, 6480000, 1080000, 1)}
    </w:r>
  </w:p>
</w:hdr>` : null;

  const footerXml = footerRelId ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r>
      ${makeImgDrawing(footerRelId, 6480000, 1080000, 2)}
    </w:r>
  </w:p>
</w:ftr>` : null;

  // Relationships for images (firmas + header/footer)
  const relEntries = [];
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

  sigImgData.forEach(({ relId, ext }) => {
    relEntries.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${relId}.${ext}"/>`);
  });

  // Header/footer images (from /Formatos)
  const headerPath = path.join(__dirname, 'Formatos', 'header.png');
  const footerPath = path.join(__dirname, 'Formatos', 'footer.png');
  if (fs.existsSync(headerPath)) {
    headerRelId = 'rIdHeaderImg';
    relEntries.push(`<Relationship Id="${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/header.png"/>`);
    relEntries.push(`<Relationship Id="rId_header1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`);
  }
  if (fs.existsSync(footerPath)) {
    footerRelId = 'rIdFooterImg';
    relEntries.push(`<Relationship Id="${footerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/footer.png"/>`);
    relEntries.push(`<Relationship Id="rId_footer1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`);
  }

  // Agregar referencias a header/footer si existen
  const headerRef = headerRelId ? `<w:headerReference w:type="default" r:id="rId_header1"/>` : '';
  const footerRef = footerRelId ? `<w:footerReference w:type="default" r:id="rId_footer1"/>` : '';
  if (headerRef || footerRef) {
    updatedDocumentXml = documentXml.replace('<w:sectPr>', `<w:sectPr>${headerRef}${footerRef}`);
  }

  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relEntries.join('\n')}
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
      <w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const appRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', appRels);
  zip.file('word/_rels/document.xml.rels', relsDoc);
  zip.file('word/document.xml', updatedDocumentXml);
  zip.file('word/styles.xml', stylesXml);

  // Agregar imágenes de firmas al zip
  sigImgData.forEach(({ relId, ext, buffer }) => {
    zip.file(`word/media/${relId}.${ext}`, buffer, { binary: true });
  });

  // Copiar header/footer del template de acta para mantener el membrete universitario
  try {
    const actaTemplatePath = path.join(__dirname, 'Formatos', 'Acta de sustentación.docx');
    if (fs.existsSync(actaTemplatePath)) {
      const actaZip = new PizZip(fs.readFileSync(actaTemplatePath, 'binary'));
      const header1 = actaZip.file('word/header1.xml');
      const footer1 = actaZip.file('word/footer1.xml');
      const headerRels = actaZip.file('word/_rels/header1.xml.rels');
      const footerRels = actaZip.file('word/_rels/footer1.xml.rels');
      if (header1) zip.file('word/header1.xml', header1.asText());
      if (footer1) zip.file('word/footer1.xml', footer1.asText());
      if (headerRels) zip.file('word/_rels/header1.xml.rels', headerRels.asText());
      if (footerRels) zip.file('word/_rels/footer1.xml.rels', footerRels.asText());
      actaZip.file(/^word\/media\//).forEach(f => {
        try { zip.file(f.name, f.asBinary(), { binary: true }); } catch (_) {}
      });
      if (header1 || footer1) {
        const ct = zip.file('[Content_Types].xml').asText();
        const extras = [];
        if (header1) extras.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
        if (footer1) extras.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
        zip.file('[Content_Types].xml', ct.replace('</Types>', extras.join('') + '</Types>'));

        const updatedDoc = zip.file('word/document.xml').asText();
        const headerRef = header1 ? '<w:headerReference w:type="default" r:id="rId_header1"/>' : '';
        const footerRef = footer1 ? '<w:footerReference w:type="default" r:id="rId_footer1"/>' : '';
        const updatedDocWithRefs = updatedDoc.replace('<w:sectPr>', `<w:sectPr>${headerRef}${footerRef}`);
        zip.file('word/document.xml', updatedDocWithRefs);
        const docRels = zip.file('word/_rels/document.xml.rels').asText();
        const relEntries = [];
        if (header1) relEntries.push('<Relationship Id="rId_header1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
        if (footer1) relEntries.push('<Relationship Id="rId_footer1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
        zip.file('word/_rels/document.xml.rels', docRels.replace('</Relationships>', relEntries.join('') + '</Relationships>'));
      }
    }
  } catch (err) {
    console.warn('generateActaDocx: no se pudo copiar header/footer del template:', err.message);
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function generateMeritoriaDocx({ title, students, directors, date, signatures }) {
  const studentParts = students.map(s =>
    s.student_code ? `${s.name} (${s.student_code})` : s.name
  );
  const studentStr = escapeXmlChar(studentParts.join(' y '));
  const titleEsc = escapeXmlChar(title);
  const dateEsc = escapeXmlChar(date);

  const dir1 = directors[0] || '';
  const dir2 = directors[1] || '';
  const sig1 = signatures.find(s => s.signer_name.toLowerCase() === dir1.toLowerCase());
  const sig2 = dir2 ? signatures.find(s => s.signer_name.toLowerCase() === dir2.toLowerCase()) : null;

  // Propiedades de párrafo por defecto: justificado, Calibri 12pt, espaciado normal
  const defaultPPr = `<w:pPr>
      <w:jc w:val="both"/>
      <w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/>
    </w:pPr>`;
  const defaultRPr = `<w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr>`;
  const boldRPr = `<w:rPr>
      <w:b/><w:bCs/>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr>`;
  const headingRPr = `<w:rPr>
      <w:b/><w:bCs/>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
      <w:u w:val="single"/>
    </w:rPr>`;

  function run(text, rPr) {
    return `<w:r>${rPr || defaultRPr}<w:t xml:space="preserve">${escapeXmlChar(text)}</w:t></w:r>`;
  }
  function bold(text) { return run(text, boldRPr); }
  function heading(text) { return run(text, headingRPr); }

  function para(runs, extraPPr) {
    const pPr = extraPPr !== undefined
      ? (extraPPr ? `<w:pPr>${extraPPr}<w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/></w:pPr>` : `<w:pPr><w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/></w:pPr>`)
      : defaultPPr;
    return `<w:p>${pPr}${runs}</w:p>`;
  }
  function justPara(runs) {
    return `<w:p>${defaultPPr}${runs}</w:p>`;
  }
  function centerPara(runs) {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/></w:pPr>${runs}</w:p>`;
  }
  function rightPara(runs) {
    return `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/></w:pPr>${runs}</w:p>`;
  }
  function emptyPara() {
    return `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr></w:p>`;
  }

  // Tabla de firmas (1 o 2 directores)
  const totalWidth = 9360; // ~16.5 cm
  const colWidth = dir2 ? Math.floor(totalWidth / 2) : totalWidth;
  const sigLine1 = sig1 ? escapeXmlChar(`[Firma digital: ${sig1.signer_name}]`) : '________________';
  const sigLine2 = sig2 ? escapeXmlChar(`[Firma digital: ${sig2.signer_name}]`) : (dir2 ? '________________' : '');

  function sigCell(sigLine, dirName, role) {
    if (!dirName) return '';
    return `<w:tc>
<w:tcPr><w:tcW w:type="dxa" w:w="${colWidth}"/>
  <w:tcBorders><w:top w:val="none" w:sz="0" w:space="0"/><w:left w:val="none" w:sz="0" w:space="0"/><w:bottom w:val="none" w:sz="0" w:space="0"/><w:right w:val="none" w:sz="0" w:space="0"/></w:tcBorders>
  <w:tcMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tcMar>
</w:tcPr>
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr>${run(sigLine)}</w:p>
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr>${bold(dirName)}</w:p>
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="40"/></w:pPr>${run(role)}</w:p>
</w:tc>`;
  }

  const sigTable = `<w:tbl>
<w:tblPr>
  <w:tblW w:w="${totalWidth}" w:type="dxa"/>
  <w:jc w:val="center"/>
  <w:tblBorders>
    <w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/>
    <w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>
    <w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/>
  </w:tblBorders>
  <w:tblCellSpacing w:w="360" w:type="dxa"/>
</w:tblPr>
<w:tr>${sigCell(sigLine1, dir1, 'Director de Proyecto de Grado')}${dir2 ? sigCell(sigLine2, dir2, 'Director de Proyecto de Grado') : ''}</w:tr>
</w:tbl>`;

  const body = [
    // Encabezado centrado y en negrita
    centerPara(bold('Comité de Investigaciones')),
    centerPara(bold('Facultad de Ingeniería')),
    centerPara(bold('Universidad de San Buenaventura Cali')),
    emptyPara(),
    // Fecha alineada a la derecha
    rightPara(run(`Santiago de Cali, ${dateEsc}`)),
    emptyPara(),
    // Saludo
    justPara(run('Fraterno saludo,')),
    emptyPara(),
    // Cuerpo justificado
    `<w:p>${defaultPPr}${run('Como evaluador(es) del trabajo de grado titulado ')}${bold(`"${titleEsc}"`)}${run(`, desarrollado por ${studentStr}, se deja constancia de que el documento presenta una excelente estructuración académica y metodológica. El trabajo incluye una revisión sistemática de la literatura pertinente, el desarrollo de un modelo técnico sólido, así como la realización de pruebas con usuarios reales y validaciones funcionales que respaldan la propuesta planteada.`)}</w:p>`,
    justPara(run('Durante el desarrollo del proyecto, los estudiantes demostraron una alta capacidad de análisis, diseño e implementación de soluciones tecnológicas avanzadas, evidenciando un nivel de madurez académica y profesional acorde con el ejercicio de la ingeniería de software.')),
    justPara(run('Adicionalmente, tras la revisión del documento y del proceso de desarrollo del trabajo, no se evidencian indicios de uso inadecuado de herramientas de inteligencia artificial en la elaboración del mismo.')),
    justPara(run('Por lo anterior, considero que este trabajo reúne los méritos suficientes para ser postulado como Trabajo de Grado Meritorio, tanto por la calidad académica de su desarrollo como por el potencial de aplicabilidad de sus resultados en contextos reales.')),
    emptyPara(),
    justPara(run('Cordialmente,')),
    emptyPara(),
    emptyPara(),
    sigTable,
    `<w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgMar w:top="1701" w:right="1134" w:bottom="1701" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/>
      <w:pgSz w:w="12240" w:h="15840"/>
    </w:sectPr>`,
  ].join('');

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/><w:szCs w:val="22"/>
        <w:lang w:val="es-CO" w:eastAsia="es-CO"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:jc w:val="both"/>
        <w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="160"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders>
      <w:top w:val="none"/><w:left w:val="none"/>
      <w:bottom w:val="none"/><w:right w:val="none"/>
      <w:insideH w:val="none"/><w:insideV w:val="none"/>
    </w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14">
<w:body>${body}</w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const relsMain = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', relsMain);
  zip.file('word/_rels/document.xml.rels', relsDoc);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);

  // Copy header, footer and their images from acta_template.docx
  try {
    const actaTemplatePath = path.join(__dirname, 'Formatos', 'Acta de sustentación.docx');
    const actaZip = new PizZip(fs.readFileSync(actaTemplatePath, 'binary'));

    const header1 = actaZip.file('word/header1.xml');
    const footer1 = actaZip.file('word/footer1.xml');
    const headerRels = actaZip.file('word/_rels/header1.xml.rels');
    const footerRels = actaZip.file('word/_rels/footer1.xml.rels');

    if (header1) zip.file('word/header1.xml', header1.asText());
    if (footer1) zip.file('word/footer1.xml', footer1.asText());
    if (headerRels) zip.file('word/_rels/header1.xml.rels', headerRels.asText());
    if (footerRels) zip.file('word/_rels/footer1.xml.rels', footerRels.asText());

    // Copy all media used by header/footer (image1.jpeg, image2.jpeg, image3.png)
    ['image1.jpeg', 'image2.jpeg', 'image3.png'].forEach(imgName => {
      const imgFile = actaZip.file(`word/media/${imgName}`);
      if (imgFile) zip.file(`word/media/${imgName}`, imgFile.asBinary(), { binary: true });
    });
  } catch (e) {
    // If template not found, generate without header/footer rather than crashing
    console.warn('generateMeritoriaDocx: could not load acta_template for header/footer:', e.message);
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// GET /theses/:id/meritoria/status
app.get('/theses/:id/meritoria/status', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  const score = ctx.weighted?.finalScore || 0;
  if (score < 4.8) return res.json({ qualifies: false, score });

  const evaluatorNames = ctx.evaluators.map(e => e.name);
  const merSigs = db.prepare('SELECT * FROM meritoria_signatures WHERE thesis_id = ? ORDER BY signed_at ASC').all(thesisId);
  const pendingDirectors = evaluatorNames.filter(d =>
    !merSigs.some(s => s.signer_name.toLowerCase() === d.toLowerCase())
  );
  const allSigned = evaluatorNames.length > 0 && pendingDirectors.length === 0;

  // URL del último PDF firmado subido
  const lastPdf = merSigs.filter(s => s.pdf_url).pop();

  res.json({
    qualifies: true,
    score,
    directors: evaluatorNames,
    signatures: merSigs.map(s => ({ signer_name: s.signer_name, signed_at: s.signed_at })),
    pendingDirectors,
    allSigned,
    finalPdfUrl: lastPdf ? lastPdf.pdf_url : null,
    students: ctx.students,
    thesis: { title: ctx.thesis.title },
  });
});

// GET /theses/:id/meritoria/download-for-signing
app.get('/theses/:id/meritoria/download-for-signing', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  const now = new Date();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const date = `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;

  const merSigs = db.prepare('SELECT * FROM meritoria_signatures WHERE thesis_id = ?').all(thesisId);

  const buf = generateMeritoriaDocx({
    title: ctx.thesis.title || '',
    students: ctx.students,
    directors: ctx.evaluators.map(e => e.name),
    date,
    signatures: merSigs,
  });

  // Headers para evitar caché y asegurar que se descargue el último PDF
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const format = (req.query.format || 'word').toString().toLowerCase();
  if (format === 'pdf') {
    const { execSync } = require('child_process');
    const tmpDocx = path.join('/tmp', `meritoria_${thesisId}_${Date.now()}.docx`);
    fs.writeFileSync(tmpDocx, buf);
    try {
      execSync(`libreoffice --headless --convert-to pdf --outdir /tmp "${tmpDocx}"`, { timeout: 30000, stdio: 'pipe' });
      const tmpPdf = tmpDocx.replace(/\.docx$/, '.pdf');
      const pdfBuf = fs.readFileSync(tmpPdf);
      try { fs.unlinkSync(tmpDocx); } catch {}
      try { fs.unlinkSync(tmpPdf); } catch {}
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="carta-meritoria-${thesisId}-para-firmar.pdf"`);
      return res.send(pdfBuf);
    } catch (e) {
      try { fs.unlinkSync(tmpDocx); } catch {}
      return res.status(500).json({ error: 'Error al convertir a PDF' });
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="carta-meritoria-${thesisId}-para-firmar.docx"`);
  res.send(buf);
});

// POST /theses/:id/meritoria/upload-signed  — sube PDF firmado por un director
app.post('/theses/:id/meritoria/upload-signed', authMiddleware, upload.single('signed_pdf'), (req, res) => {
  const thesisId = req.params.id;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });

  const { signer_name } = req.body;
  if (!signer_name) return res.status(400).json({ error: 'signer_name requerido' });
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const ctx = getActaContext(thesisId);
  if (!ctx) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(404).json({ error: 'not found' }); }

  if (!ctx.directors.some(d => d.toLowerCase() === signer_name.toLowerCase())) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'El nombre no corresponde a ningún director de la tesis' });
  }

  // Eliminar firma previa si existe
  const existing = db.prepare('SELECT * FROM meritoria_signatures WHERE thesis_id = ? AND LOWER(signer_name) = LOWER(?)').get(thesisId, signer_name);
  if (existing && existing.pdf_url) {
    const oldPath = path.join(uploadDir, path.basename(existing.pdf_url));
    try { fs.unlinkSync(oldPath); } catch {}
    db.prepare('DELETE FROM meritoria_signatures WHERE id = ?').run(existing.id);
  }

  const pdfUrl = `/uploads/${path.basename(req.file.path)}`;
  db.prepare('INSERT INTO meritoria_signatures (id, thesis_id, signer_name, signer_user_id, signed_at, pdf_url) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), thesisId, signer_name, req.user.id, Date.now(), pdfUrl);

  res.json({ ok: true, message: 'Firma registrada en carta meritoria' });
});

// GET /theses/:id/meritoria/download-final  — descarga la carta final (PDF: último subido, Word: regenerado)
app.get('/theses/:id/meritoria/download-final', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  const isEvaluator = !!db.prepare('SELECT 1 FROM thesis_evaluators WHERE thesis_id = ? AND evaluator_id = ?').get(thesisId, req.user.id);
  if (!isAdmin && !isEvaluator) return res.status(403).json({ error: 'forbidden' });

  const format = (req.query.format || 'pdf').toString().toLowerCase();
  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  const merSigs = db.prepare('SELECT * FROM meritoria_signatures WHERE thesis_id = ? ORDER BY signed_at ASC').all(thesisId);

  if (format === 'word') {
    const now = new Date();
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const date = `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
    const buf = generateMeritoriaDocx({
      title: ctx.thesis.title || '',
      students: ctx.students,
      directors: ctx.evaluators.map(e => e.name),
      date,
      signatures: merSigs,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="carta-meritoria-${thesisId}.docx"`);
    return res.send(buf);
  }

  // PDF: devolver el último PDF firmado subido
  const lastPdf = merSigs.filter(s => s.pdf_url).pop();
  if (!lastPdf) return res.status(404).json({ error: 'No hay PDF firmado disponible' });
  const pdfPath = path.join(uploadDir, path.basename(lastPdf.pdf_url));
  if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="carta-meritoria-${thesisId}.pdf"`);
  res.sendFile(pdfPath);
});

// POST /theses/:id/generate-signing-token — genera un token compartible para firma sin login
app.post('/theses/:id/generate-signing-token', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const { signerName, signerRole } = req.body;
  
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  // Generar token único
  const token = crypto.randomBytes(24).toString('hex');
  const tokenId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Guardar token
  db.prepare(`INSERT INTO signing_tokens (id, thesis_id, token, signer_name, signer_role, created_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)`).run(tokenId, thesisId, token, signerName, signerRole, now);

  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
  const signUrl = `${frontendBase}/sign/token/${token}`;
  res.json({ token, signUrl });
});

// GET /sign/token/:token — devuelve data para formulario de firma (sin autenticación)
app.get('/sign/token/:token', (req, res) => {
  const token = req.params.token;
  
  const tokenRow = db.prepare('SELECT * FROM signing_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!tokenRow) return res.status(404).json({ error: 'Token inválido o ya utilizado' });

  const ctx = getActaContext(tokenRow.thesis_id);
  if (!ctx) return res.status(404).json({ error: 'Tesis no encontrada' });

  res.json({
    token,
    thesisId: tokenRow.thesis_id,
    signerName: tokenRow.signer_name,
    signerRole: tokenRow.signer_role,
    thesis: { title: ctx.thesis.title },
    students: ctx.students,
    directors: ctx.directors,
  });
});

// GET /sign/token/:token/download-pdf — descarga PDF del acta para firmar sin autenticación
app.get('/sign/token/:token/download-pdf', async (req, res) => {
  const token = req.params.token;
  const tokenRow = db.prepare('SELECT * FROM signing_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!tokenRow) return res.status(404).json({ error: 'Token inválido o ya utilizado' });

  const thesisId = tokenRow.thesis_id;

  // Siempre regenerar el PDF base al descargar para firmar, para asegurar que no se use
  // una versión antigua almacenada que contenga texto obsoleto.
  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'Tesis no encontrada' });

  const { thesis, students, evaluators, directors, weighted, programName, signatures: ctxSignatures, programDirectors } = ctx;
  // Include signing_tokens for title-prefixed names
  const digSigsToken = db.prepare('SELECT * FROM digital_signatures WHERE thesis_id = ?').all(thesisId);
  const sigTokensToken = db.prepare('SELECT signer_name, signer_role FROM signing_tokens WHERE thesis_id = ?').all(thesisId);
  const signatures = digSigsToken.length > 0 ? digSigsToken : [...ctxSignatures, ...sigTokensToken];

  const defenseDate = thesis.defense_date ? new Date(Number(thesis.defense_date)) : new Date();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const timeText = defenseDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const defenseYear = defenseDate.getFullYear();
  const defenseMonth = defenseDate.getMonth() + 1;
  const defensePeriod = defenseMonth >= 7 ? 'II' : 'I';

  const periodStart = defensePeriod === 'I' ? new Date(defenseYear,0,1).getTime() : new Date(defenseYear,6,1).getTime();
  const periodEnd   = defensePeriod === 'I' ? new Date(defenseYear,6,1).getTime() : new Date(defenseYear+1,0,1).getTime();
  const thesesInPeriod = db.prepare(`SELECT id FROM theses WHERE defense_date IS NOT NULL AND CAST(defense_date AS INTEGER) >= ? AND CAST(defense_date AS INTEGER) < ? ORDER BY CAST(defense_date AS INTEGER) ASC`).all(periodStart, periodEnd);
  let thesisPos = 1;
  for (let i = 0; i < thesesInPeriod.length; i++) { if (thesesInPeriod[i].id === thesis.id) { thesisPos = i+1; break; } }
  const thesisNumber = String(thesisPos).padStart(2, '0');

  function numToText(n) {
    const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
    const teens = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
    const tens2 = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    if (n < 10) return units[n];
    if (n < 20) return teens[n-10];
    const t = Math.floor(n/10), u = n%10;
    if (u === 0) return tens2[t];
    if (t === 2) return 'veinti'+units[u];
    return tens2[t]+' y '+units[u];
  }
  function numToTextYear(n) {
    if (n < 1000) return numToText(n);
    const th = Math.floor(n/1000), rest = n%1000;
    const thW = th === 1 ? 'mil' : numToText(th)+' mil';
    return rest === 0 ? thW : thW+' '+numToText(rest);
  }

  try {
    const docxBuf = generateActaDocx({
      thesisNumber,
      year: defenseYear,
      period: defensePeriod,
      lugar: thesis.defense_location || 'Auditorio por definir',
      hora: timeText,
      dia_numero: defenseDate.getDate(),
      dia_texto: numToText(defenseDate.getDate()),
      mes_nombre: months[defenseDate.getMonth()],
      year_text: `${defenseYear} (${numToTextYear(defenseYear)})`,
      titulo: thesis.title || '',
      estudiantes: students.map(s => s.name).join(', '),
      codigos: students.map(s => s.student_code || '').filter(Boolean).join(', ') || 'N/A',
      director: directors.join(', '),
      evaluadores: evaluators.map(e => e.name).join(', '),
      observaciones: thesis.defense_info || 'Sin observaciones registradas',
      classification: scoreClassification(weighted.finalScore),
      nota: Number(weighted.finalScore || 0).toFixed(1),
      calificacion_letras: scoreToSpanishText(weighted.finalScore),
      evaluators,
      directors,
      programDirectors,
      signatures,
      programName,
    });

    // Convertir DOCX a PDF usando función auxiliar
    const pdfBuffer = await convertDocxToPdf(docxBuf, `acta_token_${thesisId}`);
    const stamped = await overlayHeaderFooterOnPdf(pdfBuffer);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stamped.length);
    res.setHeader('Content-Disposition', `attachment; filename="acta-${thesisId}-para-firmar.pdf"`);
    return res.send(stamped);
  } catch (e) {
    console.error('Error generando PDF por token:', e);
    return res.status(500).json({ error: 'Error generando PDF' });
  }
});

// Helper: save signature image from base64 data URL or uploaded file
function saveSignatureImage(req, signerName) {
  let signatureImageUrl = null;
  // Option 1: base64 data URL from canvas drawing
  const sigDataUrl = req.body && req.body.signature_image_data;
  if (sigDataUrl && sigDataUrl.startsWith('data:image/')) {
    const matches = sigDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const imgName = `sig-${Date.now()}-${signerName.replace(/\s+/g, '-')}.${ext}`;
      const imgPath = path.join(__dirname, 'uploads', imgName);
      fs.writeFileSync(imgPath, buffer);
      signatureImageUrl = `/uploads/${imgName}`;
    }
  }
  // Option 2: uploaded image file (from upload.fields)
  if (!signatureImageUrl && req.files && req.files.signature_image && req.files.signature_image[0]) {
    const imgFile = req.files.signature_image[0];
    const ext = path.extname(imgFile.originalname) || '.png';
    const imgName = `sig-${Date.now()}-${signerName.replace(/\s+/g, '-')}${ext}`;
    const imgPath = path.join(__dirname, 'uploads', imgName);
    fs.renameSync(imgFile.path, imgPath);
    signatureImageUrl = `/uploads/${imgName}`;
  }
  return signatureImageUrl;
}

// POST /sign/token/:token/upload-signed — sube PDF firmado sin autenticación
app.post('/sign/token/:token/upload-signed', upload.fields([{ name: 'signed_pdf', maxCount: 1 }, { name: 'signature_image', maxCount: 1 }]), (req, res) => {
  const token = req.params.token;

  const tokenRow = db.prepare('SELECT * FROM signing_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!tokenRow) return res.status(404).json({ error: 'Token inválido o ya utilizado' });

  const pdfFile = req.files && req.files.signed_pdf && req.files.signed_pdf[0];
  if (!pdfFile) return res.status(400).json({ error: 'No se subió archivo' });

  const thesisId = tokenRow.thesis_id;
  const signerName = tokenRow.signer_name;
  const signerRole = tokenRow.signer_role;

  // Guardar PDF
  const fileName = `${Date.now()}-${signerName.replace(/\s+/g,'-')}.pdf`;
  const filePath = path.join(__dirname, 'uploads', fileName);
  fs.renameSync(pdfFile.path, filePath);
  const pdf_url = `/uploads/${fileName}`;

  // Save signature image (canvas drawing or uploaded image)
  const signatureImageUrl = saveSignatureImage(req, signerName);

  // Normalizar rol al valor canónico esperado por el endpoint de estado
  const canonicalRole = (signerRole === 'evaluador' || signerRole === 'evaluator') ? 'evaluator'
    : signerRole === 'director' ? 'director'
    : 'program_director';

  // Intentar obtener signer_user_id por nombre (para evaluadores), strip title prefix
  let signerUserId = null;
  if (canonicalRole === 'evaluator') {
    let u = db.prepare('SELECT id FROM users WHERE full_name = ?').get(signerName);
    if (!u) {
      // Try stripping academic title prefix
      const _tp2 = ['profesional','esp.','mg.','phd.','dr.'];
      let stripped = signerName.trim().toLowerCase();
      for (const t of _tp2) { if (stripped.startsWith(t + ' ')) { stripped = signerName.trim().slice(t.length + 1).trim(); break; } }
      if (stripped !== signerName) u = db.prepare('SELECT id FROM users WHERE full_name = ?').get(stripped);
    }
    if (u) signerUserId = u.id;
  }

  const now = Math.floor(Date.now() / 1000);
  const sigId = crypto.randomUUID();
  db.prepare(`INSERT INTO digital_signatures (id, thesis_id, signer_user_id, signer_name, signer_role, signed_at, pdf_url, signature_image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sigId, thesisId, signerUserId, signerName, canonicalRole, now, pdf_url, signatureImageUrl);

  // Actualizar signed_actas con el nuevo PDF (cadena de firmas: siempre el último PDF)
  const existingActa = db.prepare('SELECT id FROM signed_actas WHERE thesis_id = ? ORDER BY updated_at DESC LIMIT 1').get(thesisId);
  const nowMs = Date.now();
  if (existingActa) {
    db.prepare('UPDATE signed_actas SET current_pdf_url = ?, updated_at = ? WHERE id = ?')
      .run(fileName, nowMs, existingActa.id);
  } else {
    db.prepare('INSERT INTO signed_actas (id, thesis_id, current_pdf_url, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), thesisId, fileName, 1, 'pending', nowMs, nowMs);
  }

  // Marcar token como usado
  db.prepare('UPDATE signing_tokens SET used_at = ? WHERE token = ?').run(now, token);

  res.json({ success: true, pdf_url });
});

// POST /theses/:id/meritoria/generate-signing-token — genera token para firma meritoria sin login
app.post('/theses/:id/meritoria/generate-signing-token', authMiddleware, (req, res) => {
  const thesisId = req.params.id;
  const { signerName, signerRole } = req.body;
  
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isAdmin = roles.includes('admin') || roles.includes('superadmin');
  if (!isAdmin) return res.status(403).json({ error: 'forbidden' });

  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'not found' });

  // Generar token único
  const token = crypto.randomBytes(24).toString('hex');
  const tokenId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Guardar token (marcado con prefijo meritoria_ en signer_role)
  db.prepare(`INSERT INTO signing_tokens (id, thesis_id, token, signer_name, signer_role, created_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)`).run(tokenId, thesisId, token, signerName, 'meritoria_' + signerRole, now);

  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
  const signUrl = `${frontendBase}/sign/meritoria/token/${token}`;
  res.json({ token, signUrl });
});

// GET /sign/meritoria/token/:token — devuelve data para formulario de firma meritoria (sin autenticación)
app.get('/sign/meritoria/token/:token', (req, res) => {
  const token = req.params.token;
  
  const tokenRow = db.prepare('SELECT * FROM signing_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!tokenRow) return res.status(404).json({ error: 'Token inválido o ya utilizado' });

  // Verificar que es un token de meritoria
  if (!tokenRow.signer_role.startsWith('meritoria_')) return res.status(404).json({ error: 'Token no es válido para meritoria' });

  const ctx = getActaContext(tokenRow.thesis_id);
  if (!ctx) return res.status(404).json({ error: 'Tesis no encontrada' });

  const actualRole = tokenRow.signer_role.replace('meritoria_', '');

  res.json({
    token,
    thesisId: tokenRow.thesis_id,
    signerName: tokenRow.signer_name,
    signerRole: actualRole,
    thesis: { title: ctx.thesis.title },
    students: ctx.students,
    directors: ctx.directors,
  });
});

// GET /sign/meritoria/token/:token/download-pdf — descarga PDF de carta meritoria sin autenticación
app.get('/sign/meritoria/token/:token/download-pdf', async (req, res) => {
  const token = req.params.token;
  const tokenRow = db.prepare('SELECT * FROM signing_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!tokenRow) return res.status(404).json({ error: 'Token inválido o ya utilizado' });
  if (!tokenRow.signer_role.startsWith('meritoria_')) return res.status(404).json({ error: 'Token no es válido para meritoria' });

  const thesisId = tokenRow.thesis_id;
  const ctx = getActaContext(thesisId);
  if (!ctx) return res.status(404).json({ error: 'Tesis no encontrada' });

  const now = new Date();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const date = `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
  const merSigs = db.prepare('SELECT * FROM meritoria_signatures WHERE thesis_id = ?').all(thesisId);

  const buf = generateMeritoriaDocx({
    title: ctx.thesis.title || '',
    students: ctx.students,
    directors: ctx.directors,
    date,
    signatures: merSigs,
  });

  try {
    // Convertir DOCX a PDF usando función auxiliar
    const pdfBuf = await convertDocxToPdf(buf, `meritoria_token_${thesisId}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="carta-meritoria-${thesisId}-para-firmar.pdf"`);
    return res.send(pdfBuf);
  } catch (e) {
    console.error('Error generando PDF meritoria por token:', e);
    return res.status(500).json({ error: 'Error al convertir a PDF' });
  }
});

// POST /sign/meritoria/token/:token/upload-signed — sube PDF firmado meritoria sin autenticación
app.post('/sign/meritoria/token/:token/upload-signed', upload.fields([{ name: 'signed_pdf', maxCount: 1 }, { name: 'signature_image', maxCount: 1 }]), (req, res) => {
  const token = req.params.token;

  const tokenRow = db.prepare('SELECT * FROM signing_tokens WHERE token = ? AND used_at IS NULL').get(token);
  if (!tokenRow) return res.status(404).json({ error: 'Token inválido o ya utilizado' });

  if (!tokenRow.signer_role.startsWith('meritoria_')) return res.status(404).json({ error: 'Token no es válido para meritoria' });
  const pdfFile = req.files && req.files.signed_pdf && req.files.signed_pdf[0];
  if (!pdfFile) return res.status(400).json({ error: 'No se subió archivo' });

  const thesisId = tokenRow.thesis_id;
  const signerName = tokenRow.signer_name;

  // Guardar PDF
  const fileName = `${Date.now()}-meritoria-${signerName.replace(/\s+/g,'-')}.pdf`;
  const filePath = path.join(__dirname, 'uploads', fileName);
  fs.renameSync(pdfFile.path, filePath);
  const pdf_url = `/uploads/${fileName}`;

  // Save signature image
  const signatureImageUrl = saveSignatureImage(req, signerName);

  // Guardar en meritoria_signatures
  const now = Math.floor(Date.now() / 1000);
  const sigId = crypto.randomUUID();
  db.prepare(`INSERT INTO meritoria_signatures (id, thesis_id, signer_name, signed_at, pdf_url)
    VALUES (?, ?, ?, ?, ?)`).run(sigId, thesisId, signerName, now, pdf_url);

  // Also store signature image in digital_signatures for acta embedding
  if (signatureImageUrl) {
    db.prepare(`INSERT INTO digital_signatures (id, thesis_id, signer_name, signer_role, signed_at, pdf_url, signature_image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), thesisId, signerName, 'meritoria_director', now, pdf_url, signatureImageUrl);
  }

  // Marcar token como usado
  const usedAt = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE signing_tokens SET used_at = ? WHERE token = ?').run(usedAt, token);

  res.json({ success: true, pdf_url });
});

// GET /admin/program-rubrics/:programId — obtener rúbricas de un programa
app.get('/admin/program-rubrics/:programId', authMiddleware, (req, res) => {
  const programId = req.params.programId;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isSuperAdmin = roles.includes('superadmin');
  
  // Si no es superadmin, verificar que el admin esté asociado al programa
  if (!isSuperAdmin) {
    const adminProg = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ? AND program_id = ?').get(req.user.id, programId);
    if (!adminProg) return res.status(403).json({ error: 'No tiene acceso a este programa' });
  }

  const rubrics = db.prepare('SELECT * FROM program_rubrics WHERE program_id = ?').all(programId);
  const result = rubrics.map(r => ({
    ...r,
    sections_json: JSON.parse(r.sections_json)
  }));
  res.json(result);
});

// PUT /admin/program-rubrics/:programId/:evaluationType — actualizar rúbrica
app.put('/admin/program-rubrics/:programId/:evaluationType', authMiddleware, (req, res) => {
  const { programId, evaluationType } = req.params;
  const { sections } = req.body;

  if (!sections || !Array.isArray(sections)) {
    return res.status(400).json({ error: 'sections es requerido y debe ser un array' });
  }

  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isSuperAdmin = roles.includes('superadmin');
  
  // Si no es superadmin, verificar que el admin esté asociado al programa
  if (!isSuperAdmin) {
    const adminProg = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ? AND program_id = ?').get(req.user.id, programId);
    if (!adminProg) return res.status(403).json({ error: 'No tiene acceso a este programa' });
  }

  const now = Math.floor(Date.now() / 1000);
  const rubricId = crypto.randomUUID();
  const sectionsJson = JSON.stringify(sections);

  try {
    const existing = db.prepare('SELECT id FROM program_rubrics WHERE program_id = ? AND evaluation_type = ?').get(programId, evaluationType);
    
    if (existing) {
      // Actualizar
      db.prepare('UPDATE program_rubrics SET sections_json = ?, updated_at = ? WHERE id = ?')
        .run(sectionsJson, now, existing.id);
      const updated = db.prepare('SELECT * FROM program_rubrics WHERE id = ?').get(existing.id);
      res.json({
        ...updated,
        sections_json: JSON.parse(updated.sections_json)
      });
    } else {
      // Crear nueva
      db.prepare('INSERT INTO program_rubrics (id, program_id, evaluation_type, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(rubricId, programId, evaluationType, sectionsJson, now, now);
      res.json({
        id: rubricId,
        program_id: programId,
        evaluation_type: evaluationType,
        sections_json: sections,
        created_at: now,
        updated_at: now
      });
    }
  } catch (e) {
    console.error('Error saving rubric:', e);
    res.status(500).json({ error: 'Error al guardar rúbrica' });
  }
});

// GET /super/rubrics — obtener todas las rúbricas (solo superadmin)
app.get('/super/rubrics', authMiddleware, (req, res) => {
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  if (!roles.includes('superadmin')) return res.status(403).json({ error: 'forbidden' });

  const rubrics = db.prepare(`SELECT pr.*, p.name as program_name FROM program_rubrics pr 
    LEFT JOIN programs p ON pr.program_id = p.id ORDER BY p.name, pr.evaluation_type`).all();
  
  const result = rubrics.map(r => ({
    ...r,
    sections_json: JSON.parse(r.sections_json)
  }));
  res.json(result);
});

// GET /admin/program-rubrics/:programId/:evaluationType/download-xlsx — descargar rúbrica en xlsx
app.get('/admin/program-rubrics/:programId/:evaluationType/download-xlsx', authMiddleware, async (req, res) => {
  const { programId, evaluationType } = req.params;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isSuperAdmin = roles.includes('superadmin');

  if (!isSuperAdmin) {
    const adminProg = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ? AND program_id = ?').get(req.user.id, programId);
    if (!adminProg) return res.status(403).json({ error: 'No tiene acceso a este programa' });
  }

  const program = db.prepare('SELECT name FROM programs WHERE id = ?').get(programId);
  const rubric = db.prepare('SELECT * FROM program_rubrics WHERE program_id = ? AND evaluation_type = ?').get(programId, evaluationType);
  if (!rubric) return res.status(404).json({ error: 'Rúbrica no encontrada' });

  try {
    const ExcelJS = require('exceljs');
    const sections = JSON.parse(rubric.sections_json);
    const typeLabel = evaluationType === 'document' ? 'Documento' : 'Sustentación';
    const programName = program ? program.name : 'Programa';

    // Paleta de colores
    const COLOR = {
      titleBg:      '1E3A5F', // azul oscuro
      titleFg:      'FFFFFF',
      headerBg:     '2E75B6', // azul medio
      headerFg:     'FFFFFF',
      sectionBg:    'D6E4F0', // azul claro
      sectionFg:    '1E3A5F',
      criterionBg:  'FFFFFF',
      criterionAlt: 'F0F7FF', // azul muy claro (filas alternas)
      inputBg:      'FFFDE7', // amarillo suave — celda para llenar
      subtotalBg:   'E2EFDA', // verde claro
      subtotalFg:   '375623',
      totalBg:      '375623', // verde oscuro
      totalFg:      'FFFFFF',
      border:       'B0BEC5',
    };

    const font = (bold = false, size = 11, color = '000000') => ({ name: 'Calibri', bold, size, color: { argb: 'FF' + color } });
    const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
    const border = () => {
      const s = { style: 'thin', color: { argb: 'FF' + COLOR.border } };
      return { top: s, left: s, bottom: s, right: s };
    };
    const align = (h = 'left', v = 'middle', wrap = false) => ({ horizontal: h, vertical: v, wrapText: wrap });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SisTesis';
    wb.created = new Date();
    const ws = wb.addWorksheet(`Rúbrica ${typeLabel}`.substring(0, 31), {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    // Anchos de columnas
    ws.columns = [
      { key: 'seccion',   width: 28 },
      { key: 'peso',      width: 10 },
      { key: 'nro',       width: 8  },
      { key: 'criterio',  width: 42 },
      { key: 'maxScore',  width: 16 },
      { key: 'obtenido',  width: 18 },
      { key: 'aporte',    width: 20 },
    ];

    // --- Fila 1: Título ---
    const titleRow = ws.addRow([`RÚBRICA DE EVALUACIÓN — ${typeLabel.toUpperCase()}`, '', '', '', '', '', '']);
    ws.mergeCells(1, 1, 1, 7);
    titleRow.height = 32;
    const titleCell = titleRow.getCell(1);
    titleCell.font = font(true, 14, COLOR.titleFg);
    titleCell.fill = fill(COLOR.titleBg);
    titleCell.alignment = align('center', 'middle');
    titleCell.border = border();

    // --- Fila 2: Subtítulo programa ---
    const subRow = ws.addRow([programName, '', '', '', '', '', '']);
    ws.mergeCells(2, 1, 2, 7);
    subRow.height = 20;
    const subCell = subRow.getCell(1);
    subCell.font = font(false, 11, COLOR.titleFg);
    subCell.fill = fill(COLOR.titleBg);
    subCell.alignment = align('center', 'middle');
    subCell.border = border();

    // --- Fila 3: Encabezados ---
    const headers = ['Sección', 'Peso (%)', 'Criterios', 'Criterio de Evaluación', 'Puntaje Máximo', 'Puntaje Obtenido', 'Aporte Ponderado'];
    const headerRow = ws.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = font(true, 11, COLOR.headerFg);
      cell.fill = fill(COLOR.headerBg);
      cell.alignment = align('center', 'middle', true);
      cell.border = border();
    });

    // --- Datos por sección ---
    let dataRowStart = 4; // fila Excel actual (1-indexed)
    let currentExcelRow = 4;
    const sectionSubtotalRefs = [];

    sections.forEach((section, sIdx) => {
      const count = section.criteria.length;
      const sectionFirstRow = currentExcelRow;
      const sectionColors = [COLOR.sectionBg, 'D0E8FF', 'C8E6C9', 'FFE0B2', 'E8DAEF'];
      const secBg = sectionColors[sIdx % sectionColors.length];

      section.criteria.forEach((criterion, cIdx) => {
        const er = currentExcelRow;
        const isAlt = cIdx % 2 === 1;
        const critBg = isAlt ? COLOR.criterionAlt : COLOR.criterionBg;

        const row = ws.addRow([
          cIdx === 0 ? section.name : '',
          cIdx === 0 ? section.weight : '',
          cIdx === 0 ? count : '',
          criterion.name,
          criterion.maxScore,
          null, // celda para llenar — amarilla
          null, // fórmula
        ]);
        row.height = 22;

        // Sección (A)
        const cA = row.getCell(1);
        cA.font = font(true, 11, COLOR.sectionFg);
        cA.fill = fill(secBg);
        cA.alignment = align('center', 'middle', true);
        cA.border = border();

        // Peso (B)
        const cB = row.getCell(2);
        cB.font = font(true, 11, COLOR.sectionFg);
        cB.fill = fill(secBg);
        cB.alignment = align('center', 'middle');
        cB.numFmt = '0"%"';
        cB.border = border();

        // Nro criterios (C)
        const cC = row.getCell(3);
        cC.font = font(false, 10, '555555');
        cC.fill = fill(secBg);
        cC.alignment = align('center', 'middle');
        cC.border = border();

        // Criterio (D)
        const cD = row.getCell(4);
        cD.font = font(false, 11);
        cD.fill = fill(critBg);
        cD.alignment = align('left', 'middle', true);
        cD.border = border();

        // Puntaje máximo (E)
        const cE = row.getCell(5);
        cE.font = font(false, 11, '444444');
        cE.fill = fill(critBg);
        cE.alignment = align('center', 'middle');
        cE.border = border();

        // Puntaje obtenido (F) — celda amarilla para llenar
        const cF = row.getCell(6);
        cF.fill = fill(COLOR.inputBg);
        cF.alignment = align('center', 'middle');
        cF.border = { top: { style: 'thin', color: { argb: 'FFFFBB00' } }, left: { style: 'thin', color: { argb: 'FFFFBB00' } }, bottom: { style: 'thin', color: { argb: 'FFFFBB00' } }, right: { style: 'thin', color: { argb: 'FFFFBB00' } } };
        cF.note = 'Ingrese el puntaje obtenido (0 – ' + criterion.maxScore + ')';

        // Aporte ponderado (G) — fórmula
        const cG = row.getCell(7);
        cG.value = { formula: `IFERROR((F${er}/E${er})*(B${sectionFirstRow}/C${sectionFirstRow}),0)` };
        cG.numFmt = '0.00';
        cG.font = font(false, 11, '1E3A5F');
        cG.fill = fill(critBg);
        cG.alignment = align('center', 'middle');
        cG.border = border();

        currentExcelRow++;
      });

      // Merge sección, peso, nro verticalmente
      if (count > 1) {
        ws.mergeCells(sectionFirstRow, 1, currentExcelRow - 1, 1);
        ws.mergeCells(sectionFirstRow, 2, currentExcelRow - 1, 2);
        ws.mergeCells(sectionFirstRow, 3, currentExcelRow - 1, 3);
      }

      // Fila subtotal sección
      const subRow2 = ws.addRow(['', '', '', `Subtotal — ${section.name}`, '', '', null]);
      subRow2.height = 20;
      const stG = subRow2.getCell(7);
      stG.value = { formula: `SUM(G${sectionFirstRow}:G${currentExcelRow - 1})` };
      stG.numFmt = '0.00';
      sectionSubtotalRefs.push(`G${currentExcelRow}`);

      [1,2,3,4,5,6,7].forEach(col => {
        const c = subRow2.getCell(col);
        c.font = font(col === 4, 11, COLOR.subtotalFg);
        c.fill = fill(COLOR.subtotalBg);
        c.alignment = align(col === 4 ? 'right' : 'center', 'middle');
        c.border = border();
      });
      currentExcelRow++;

      // Fila separadora
      const sepRow = ws.addRow(['', '', '', '', '', '', '']);
      sepRow.height = 6;
      currentExcelRow++;
    });

    // --- Fila total final ---
    const totalRow = ws.addRow(['', '', '', '', '', 'NOTA FINAL  (escala 0.0 – 5.0)', null]);
    totalRow.height = 28;
    const tG = totalRow.getCell(7);
    tG.value = { formula: `(${sectionSubtotalRefs.join('+')})/100*5` };
    tG.numFmt = '0.0';
    [1,2,3,4,5,6,7].forEach(col => {
      const c = totalRow.getCell(col);
      c.font = font(true, 13, COLOR.totalFg);
      c.fill = fill(COLOR.totalBg);
      c.alignment = align(col === 6 ? 'right' : 'center', 'middle');
      c.border = border();
    });

    // --- Nota instruccional al pie ---
    const noteRow = ws.addRow(['', '', '', '', '', '', '']);
    noteRow.height = 8;
    const instrRow = ws.addRow(['* Complete únicamente la columna "Puntaje Obtenido" (celdas en amarillo). Los aportes y la nota final se calculan automáticamente.', '', '', '', '', '', '']);
    ws.mergeCells(instrRow.number, 1, instrRow.number, 7);
    instrRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF777777' } };
    instrRow.getCell(1).alignment = align('left', 'middle');

    // Enviar respuesta
    const filename = `Rubrica_${typeLabel}_${programName.replace(/\s+/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Error generando XLSX rúbrica:', err);
    res.status(500).json({ error: 'Error generando el archivo' });
  }
});

// GET /admin/program-rubrics/:programId/download-xlsx-full — descarga ambas rúbricas + resumen en un solo xlsx
app.get('/admin/program-rubrics/:programId/download-xlsx-full', authMiddleware, async (req, res) => {
  const { programId } = req.params;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isSuperAdmin = roles.includes('superadmin');

  if (!isSuperAdmin) {
    const adminProg = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ? AND program_id = ?').get(req.user.id, programId);
    if (!adminProg) return res.status(403).json({ error: 'No tiene acceso a este programa' });
  }

  const program = db.prepare('SELECT name FROM programs WHERE id = ?').get(programId);
  const rubrics = db.prepare('SELECT * FROM program_rubrics WHERE program_id = ?').all(programId);
  if (!rubrics.length) return res.status(404).json({ error: 'No hay rúbricas para este programa' });

  try {
    const ExcelJS = require('exceljs');
    const programName = program ? program.name : 'Programa';

    const COLOR = {
      titleBg: '1E3A5F', titleFg: 'FFFFFF',
      headerBg: '2E75B6', headerFg: 'FFFFFF',
      sectionColors: ['D6E4F0', 'D5E8D4', 'FFE6CC', 'E1D5E7', 'DAE8FC'],
      sectionFg: '1E3A5F',
      criterionAlt: 'F0F7FF',
      inputBg: 'FFFDE7',
      subtotalBg: 'E2EFDA', subtotalFg: '375623',
      totalBg: '375623', totalFg: 'FFFFFF',
      border: 'B0BEC5',
      summaryAccentDoc: '2E75B6',
      summaryAccentPres: '375623',
      summaryTotal: '1E3A5F',
    };

    const font = (bold = false, size = 11, color = '000000') => ({ name: 'Calibri', bold, size, color: { argb: 'FF' + color } });
    const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
    const thinBorder = (hex = COLOR.border) => { const s = { style: 'thin', color: { argb: 'FF' + hex } }; return { top: s, left: s, bottom: s, right: s }; };
    const align = (h = 'left', v = 'middle', wrap = false) => ({ horizontal: h, vertical: v, wrapText: wrap });

    // Helper: construye una hoja de rúbrica y retorna la celda con la nota final
    const buildRubricSheet = (wb, sections, typeLabel, sheetName) => {
      const ws = wb.addWorksheet(sheetName, {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
        views: [{ state: 'frozen', ySplit: 3 }],
      });
      ws.columns = [
        { width: 28 }, { width: 10 }, { width: 8 },
        { width: 42 }, { width: 16 }, { width: 18 }, { width: 20 },
      ];

      // Título
      const titleRow = ws.addRow([`RÚBRICA DE EVALUACIÓN — ${typeLabel.toUpperCase()}`, '', '', '', '', '', '']);
      ws.mergeCells(1, 1, 1, 7);
      titleRow.height = 32;
      Object.assign(titleRow.getCell(1), { font: font(true, 14, COLOR.titleFg), fill: fill(COLOR.titleBg), alignment: align('center'), border: thinBorder() });

      // Programa
      const progRow = ws.addRow([programName, '', '', '', '', '', '']);
      ws.mergeCells(2, 1, 2, 7);
      progRow.height = 20;
      Object.assign(progRow.getCell(1), { font: font(false, 11, COLOR.titleFg), fill: fill(COLOR.titleBg), alignment: align('center'), border: thinBorder() });

      // Encabezados
      const hRow = ws.addRow(['Sección', 'Peso (%)', 'Criterios', 'Criterio de Evaluación', 'Puntaje Máximo', 'Puntaje Obtenido', 'Aporte Ponderado']);
      hRow.height = 28;
      hRow.eachCell(c => Object.assign(c, { font: font(true, 11, COLOR.headerFg), fill: fill(COLOR.headerBg), alignment: align('center', 'middle', true), border: thinBorder() }));

      let currentRow = 4;
      const sectionSubtotalRefs = [];

      sections.forEach((section, sIdx) => {
        const count = section.criteria.length;
        const secStart = currentRow;
        const secBg = COLOR.sectionColors[sIdx % COLOR.sectionColors.length];

        section.criteria.forEach((criterion, cIdx) => {
          const er = currentRow;
          const row = ws.addRow([
            cIdx === 0 ? section.name : '',
            cIdx === 0 ? section.weight : '',
            cIdx === 0 ? count : '',
            criterion.name,
            criterion.maxScore,
            null, null,
          ]);
          row.height = 22;

          const styleCell = (cell, bg, bold = false, hAlign = 'left') => Object.assign(cell, { font: font(bold, 11, COLOR.sectionFg), fill: fill(bg), alignment: align(hAlign, 'middle', true), border: thinBorder() });

          styleCell(row.getCell(1), secBg, true, 'center');
          styleCell(row.getCell(2), secBg, true, 'center');
          row.getCell(2).numFmt = '0"%"';
          styleCell(row.getCell(3), secBg, false, 'center');
          row.getCell(3).font = font(false, 10, '555555');

          const critBg = cIdx % 2 === 0 ? 'FFFFFF' : COLOR.criterionAlt;
          Object.assign(row.getCell(4), { font: font(false, 11), fill: fill(critBg), alignment: align('left', 'middle', true), border: thinBorder() });
          Object.assign(row.getCell(5), { font: font(false, 11, '444444'), fill: fill(critBg), alignment: align('center', 'middle'), border: thinBorder() });

          const cF = row.getCell(6);
          cF.fill = fill(COLOR.inputBg);
          cF.alignment = align('center', 'middle');
          cF.border = thinBorder('FFBB00');
          cF.note = `Ingrese el puntaje obtenido (0 – ${criterion.maxScore})`;

          const cG = row.getCell(7);
          cG.value = { formula: `IFERROR((F${er}/E${er})*(B${secStart}/C${secStart}),0)` };
          cG.numFmt = '0.00';
          Object.assign(cG, { font: font(false, 11, COLOR.sectionFg), fill: fill(critBg), alignment: align('center', 'middle'), border: thinBorder() });

          currentRow++;
        });

        if (count > 1) {
          ws.mergeCells(secStart, 1, currentRow - 1, 1);
          ws.mergeCells(secStart, 2, currentRow - 1, 2);
          ws.mergeCells(secStart, 3, currentRow - 1, 3);
        }

        // Subtotal sección
        const stRow = ws.addRow(['', '', '', `Subtotal — ${section.name}`, '', '', null]);
        stRow.height = 20;
        stRow.getCell(7).value = { formula: `SUM(G${secStart}:G${currentRow - 1})` };
        stRow.getCell(7).numFmt = '0.00';
        sectionSubtotalRefs.push(`G${currentRow}`);
        [1,2,3,4,5,6,7].forEach(col => {
          const c = stRow.getCell(col);
          Object.assign(c, { font: font(col === 4, 11, COLOR.subtotalFg), fill: fill(COLOR.subtotalBg), alignment: align(col === 4 ? 'right' : 'center', 'middle'), border: thinBorder() });
        });
        currentRow++;

        // Separador
        ws.addRow([]).height = 6;
        currentRow++;
      });

      // Nota final
      const totalRow = ws.addRow(['', '', '', '', '', 'NOTA FINAL  (0.0 – 5.0)', null]);
      const notaFinalRow = currentRow;
      totalRow.height = 30;
      totalRow.getCell(7).value = { formula: `(${sectionSubtotalRefs.join('+')})/100*5` };
      totalRow.getCell(7).numFmt = '0.0"  / 5.0"';
      [1,2,3,4,5,6,7].forEach(col => {
        const c = totalRow.getCell(col);
        Object.assign(c, { font: font(true, 13, COLOR.totalFg), fill: fill(COLOR.totalBg), alignment: align(col === 6 ? 'right' : 'center', 'middle'), border: thinBorder() });
      });

      // Instrucción al pie
      ws.addRow([]).height = 8;
      const instr = ws.addRow(['* Complete únicamente la columna "Puntaje Obtenido" (celdas en amarillo). Los aportes y la nota final se calculan automáticamente.']);
      ws.mergeCells(instr.number, 1, instr.number, 7);
      instr.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF777777' } };
      instr.getCell(1).alignment = align('left', 'middle');

      return { sheetName, notaFinalRow }; // para referenciar desde el resumen
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SisTesis';
    wb.created = new Date();

    // Agregar hoja resumen PRIMERO (queda como primera hoja)
    const summaryWs = wb.addWorksheet('Resumen Total', { views: [{}] });

    // Construir hojas de rúbricas
    const sheetRefs = {};
    for (const rubric of rubrics) {
      const sections = JSON.parse(rubric.sections_json);
      const typeLabel = rubric.evaluation_type === 'document' ? 'Documento' : 'Sustentación';
      const sheetName = `Rúbrica ${typeLabel}`.substring(0, 31);
      const ref = buildRubricSheet(wb, sections, typeLabel, sheetName);
      sheetRefs[rubric.evaluation_type] = ref;
    }

    // ── Construir hoja Resumen ──────────────────────────────────────────────
    summaryWs.columns = [
      { width: 6 }, { width: 36 }, { width: 22 }, { width: 22 }, { width: 22 },
    ];

    // Título
    const sTitleRow = summaryWs.addRow(['', `RESUMEN DE EVALUACIÓN — ${programName}`, '', '', '']);
    summaryWs.mergeCells(1, 2, 1, 5);
    sTitleRow.height = 34;
    Object.assign(sTitleRow.getCell(2), { font: font(true, 15, COLOR.titleFg), fill: fill(COLOR.titleBg), alignment: align('center', 'middle'), border: thinBorder() });
    summaryWs.addRow([]).height = 10;

    // Instrucción
    const instrRow = summaryWs.addRow(['', '⚙  Ajuste los porcentajes en las celdas amarillas según el reglamento del programa.', '', '', '']);
    summaryWs.mergeCells(3, 2, 3, 5);
    instrRow.getCell(2).font = { name: 'Calibri', italic: true, size: 10, color: { argb: 'FF555555' } };
    instrRow.height = 18;
    summaryWs.addRow([]).height = 6;

    // Encabezado tabla
    const sHRow = summaryWs.addRow(['', 'Componente', 'Peso (%)', 'Nota (0.0 – 5.0)', 'Aporte']);
    sHRow.height = 26;
    [2,3,4,5].forEach(col => {
      Object.assign(sHRow.getCell(col), { font: font(true, 12, COLOR.headerFg), fill: fill(COLOR.headerBg), alignment: align('center', 'middle'), border: thinBorder() });
    });

    // Filas por rúbrica
    const pesoDocRow = 6;   // fila excel donde va el peso del documento
    const pesoPrRow  = 7;   // fila excel donde va el peso de sustentación

    const docRef = sheetRefs['document'];
    const presRef = sheetRefs['presentation'];

    // Leer pesos configurados para este programa
    const programWeights = db.prepare('SELECT doc_weight, presentation_weight FROM program_weights WHERE program_id = ?').get(programId);
    const docWeight  = programWeights ? programWeights.doc_weight          : 50;
    const presWeight = programWeights ? programWeights.presentation_weight : 50;

    // Fila documento
    const docRow = summaryWs.addRow([
      '',
      docRef ? 'Rúbrica de Documento' : '(sin rúbrica)',
      docWeight, // peso real del programa
      docRef ? { formula: `'${docRef.sheetName}'!G${docRef.notaFinalRow}` } : 0,
      null,
    ]);
    docRow.height = 26;
    docRow.getCell(2).font = font(true, 12, COLOR.summaryAccentDoc);
    docRow.getCell(2).fill = fill('EBF3FB');
    docRow.getCell(2).alignment = align('left', 'middle');
    docRow.getCell(2).border = thinBorder();
    // Peso (C) — amarillo editable
    const dPeso = docRow.getCell(3);
    dPeso.fill = fill(COLOR.inputBg);
    dPeso.font = font(true, 13, '333333');
    dPeso.alignment = align('center', 'middle');
    dPeso.border = thinBorder('FFBB00');
    dPeso.numFmt = '0"%"';
    dPeso.note = 'Modifique el peso (%) de la rúbrica de Documento';
    // Nota
    const dNota = docRow.getCell(4);
    dNota.numFmt = '0.0"  / 5.0"';
    dNota.font = font(true, 13, COLOR.summaryAccentDoc);
    dNota.fill = fill('EBF3FB');
    dNota.alignment = align('center', 'middle');
    dNota.border = thinBorder();
    // Aporte = Nota * Peso / 100
    const dAporte = docRow.getCell(5);
    dAporte.value = { formula: `IFERROR(D${docRow.number}*C${docRow.number}/100,0)` };
    dAporte.numFmt = '0.00"%  / 5.0"';
    dAporte.font = font(false, 12, COLOR.summaryAccentDoc);
    dAporte.fill = fill('EBF3FB');
    dAporte.alignment = align('center', 'middle');
    dAporte.border = thinBorder();

    // Fila sustentación
    const presRow = summaryWs.addRow([
      '',
      presRef ? 'Rúbrica de Sustentación' : '(sin rúbrica)',
      presWeight, // peso real del programa
      presRef ? { formula: `'${presRef.sheetName}'!G${presRef.notaFinalRow}` } : 0,
      null,
    ]);
    presRow.height = 26;
    presRow.getCell(2).font = font(true, 12, COLOR.summaryAccentPres);
    presRow.getCell(2).fill = fill('EDF7ED');
    presRow.getCell(2).alignment = align('left', 'middle');
    presRow.getCell(2).border = thinBorder();
    const pPeso = presRow.getCell(3);
    pPeso.fill = fill(COLOR.inputBg);
    pPeso.font = font(true, 13, '333333');
    pPeso.alignment = align('center', 'middle');
    pPeso.border = thinBorder('FFBB00');
    pPeso.numFmt = '0"%"';
    pPeso.note = 'Modifique el peso (%) de la rúbrica de Sustentación';
    const pNota = presRow.getCell(4);
    pNota.numFmt = '0.0"  / 5.0"';
    pNota.font = font(true, 13, COLOR.summaryAccentPres);
    pNota.fill = fill('EDF7ED');
    pNota.alignment = align('center', 'middle');
    pNota.border = thinBorder();
    const pAporte = presRow.getCell(5);
    pAporte.value = { formula: `IFERROR(D${presRow.number}*C${presRow.number}/100,0)` };
    pAporte.numFmt = '0.00"%  / 5.0"';
    pAporte.font = font(false, 12, COLOR.summaryAccentPres);
    pAporte.fill = fill('EDF7ED');
    pAporte.alignment = align('center', 'middle');
    pAporte.border = thinBorder();

    // Fila validación suma pesos
    const validRow = summaryWs.addRow(['', `Suma de pesos (debe ser 100%)`, { formula: `C${docRow.number}+C${presRow.number}` }, '', '']);
    validRow.height = 18;
    validRow.getCell(2).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF888888' } };
    validRow.getCell(2).alignment = align('right', 'middle');
    const valCell = validRow.getCell(3);
    valCell.numFmt = '0"%"';
    valCell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFCC0000' } };
    valCell.alignment = align('center', 'middle');

    summaryWs.addRow([]).height = 10;

    // Fila NOTA TOTAL FINAL
    const finalRow = summaryWs.addRow([
      '',
      'NOTA FINAL TOTAL',
      { formula: `C${docRow.number}+C${presRow.number}` }, // total pesos — solo info
      { formula: `IFERROR(E${docRow.number}+E${presRow.number},0)` },
      '',
    ]);
    finalRow.height = 36;
    [2,3,4,5].forEach(col => {
      const c = finalRow.getCell(col);
      Object.assign(c, { font: font(true, 16, COLOR.totalFg), fill: fill(COLOR.summaryTotal), alignment: align(col === 4 ? 'center' : 'center', 'middle'), border: thinBorder() });
    });
    finalRow.getCell(3).value = '';
    finalRow.getCell(5).value = '';
    finalRow.getCell(4).numFmt = '0.0"  / 5.0"';

    // Pie resumen
    summaryWs.addRow([]).height = 14;
    const pie1 = summaryWs.addRow(['', '* Las notas de cada rúbrica se toman automáticamente de las hojas "Rúbrica Documento" y "Rúbrica Sustentación".']);
    summaryWs.mergeCells(pie1.number, 2, pie1.number, 5);
    pie1.getCell(2).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF777777' } };
    const pie2 = summaryWs.addRow(['', '* Ajuste los pesos (%) en amarillo. La nota final se recalcula automáticamente.']);
    summaryWs.mergeCells(pie2.number, 2, pie2.number, 5);
    pie2.getCell(2).font = { name: 'Calibri', italic: true, size: 9, color: { argb: 'FF777777' } };

    // Enviar
    const filename = `Rubricas_Completas_${programName.replace(/\s+/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Error generando XLSX completo:', err);
    res.status(500).json({ error: 'Error generando el archivo' });
  }
});

// POST /admin/program-rubrics/:programId/initialize — cargar rúbricas por defecto
app.post('/admin/program-rubrics/:programId/initialize', authMiddleware, (req, res) => {
  const programId = req.params.programId;
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isSuperAdmin = roles.includes('superadmin');
  
  if (!isSuperAdmin) {
    const adminProg = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ? AND program_id = ?').get(req.user.id, programId);
    if (!adminProg) return res.status(403).json({ error: 'No tiene acceso a este programa' });
  }

  // Rúbricas por defecto (hardcoded)
  const defaultRubric = [
    {
      id: "a",
      name: "Marco Teórico y Estado del Arte",
      weight: 20,
      criteria: [
        { id: "a1", name: "Comprensión del mercado actual", maxScore: 5 },
        { id: "a2", name: "Explicación de construcciones clave", maxScore: 5 },
        { id: "a3", name: "Claridad en la presentación de los antecedentes", maxScore: 5 }
      ]
    },
    {
      id: "b",
      name: "Aspectos Académicos",
      weight: 40,
      criteria: [
        { id: "b1", name: "Originalidad de la solución propuesta", maxScore: 5 },
        { id: "b2", name: "Rigur académico", maxScore: 5 },
        { id: "b3", name: "Estructura lógica del documento", maxScore: 5 },
        { id: "b4", name: "Coherencia entre objetivos y resultados", maxScore: 5 }
      ]
    },
    {
      id: "c",
      name: "Aspectos Disciplinares",
      weight: 30,
      criteria: [
        { id: "c1", name: "Implementación técnica", maxScore: 5 },
        { id: "c2", name: "Métricas y validación", maxScore: 5 },
        { id: "c3", name: "Análisis de resultados", maxScore: 5 },
        { id: "c4", name: "Discusión técnica", maxScore: 5 }
      ]
    },
    {
      id: "d",
      name: "Presentación del Documento",
      weight: 10,
      criteria: [
        { id: "d1", name: "Redacción", maxScore: 5 },
        { id: "d2", name: "Cumplimiento de normas", maxScore: 5 }
      ]
    }
  ];

  const presentationRubric = [
    {
      id: "p1",
      name: "Claridad y Dominio del Problema",
      weight: 25,
      criteria: [
        { id: "p1a", name: "Presentación clara del problema de investigación", maxScore: 5 },
        { id: "p1b", name: "Justificación bien argumentada", maxScore: 5 },
        { id: "p1c", name: "Coherencia entre problema, objetivos y resultados", maxScore: 5 }
      ]
    },
    {
      id: "p2",
      name: "Dominio Metodológico",
      weight: 25,
      criteria: [
        { id: "p2a", name: "Explicación clara de la metodología utilizada", maxScore: 5 },
        { id: "p2b", name: "Coherencia técnica en las decisiones tomadas", maxScore: 5 },
        { id: "p2c", name: "Capacidad para justificar el enfoque seleccionado", maxScore: 5 }
      ]
    },
    {
      id: "p3",
      name: "Dominio Técnico y Resultados",
      weight: 30,
      criteria: [
        { id: "p3a", name: "Explicación clara de la implementación", maxScore: 5 },
        { id: "p3b", name: "Interpretación adecuada de métricas y resultados", maxScore: 5 },
        { id: "p3c", name: "Capacidad de análisis crítico", maxScore: 5 },
        { id: "p3d", name: "Responde preguntas técnicas con solvencia", maxScore: 5 }
      ]
    },
    {
      id: "p4",
      name: "Comunicación y Presentación",
      weight: 20,
      criteria: [
        { id: "p4a", name: "Claridad expositiva", maxScore: 5 },
        { id: "p4b", name: "Uso adecuado del tiempo", maxScore: 5 },
        { id: "p4c", name: "Calidad de diapositivas", maxScore: 5 },
        { id: "p4d", name: "Seguridad y argumentación", maxScore: 5 }
      ]
    }
  ];

  const now = Math.floor(Date.now() / 1000);
  try {
    // Cargar rúbrica de documento
    db.prepare('INSERT OR IGNORE INTO program_rubrics (id, program_id, evaluation_type, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), programId, 'document', JSON.stringify(defaultRubric), now, now);
    
    // Cargar rúbrica de sustentación
    db.prepare('INSERT OR IGNORE INTO program_rubrics (id, program_id, evaluation_type, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), programId, 'presentation', JSON.stringify(presentationRubric), now, now);
    
    res.json({ success: true, message: 'Rúbricas por defecto cargadas' });
  } catch (e) {
    console.error('Error loading default rubrics:', e);
    res.status(500).json({ error: 'Error al cargar rúbricas por defecto' });
  }
});

// ============================================================================
// CONFIGURACIÓN SMTP Y NOTIFICACIONES
// ============================================================================

// GET /admin/smtp-config - obtener configuración SMTP
app.get('/admin/smtp-config', authMiddleware, requireRole('admin'), (req, res) => {
  const config = db.prepare('SELECT * FROM smtp_config WHERE user_id = ? OR is_default = 1 LIMIT 1').get(req.user.id);
  res.json(config || {});
});

// POST /admin/smtp-config - guardar configuración SMTP
// POST /admin/smtp-config/test - probar configuración SMTP
app.post('/admin/smtp-config/test', authMiddleware, requireRole('admin'), async (req, res) => {
  const { host, port, username, password, encryption } = req.body;
  const portNum = parseInt(port, 10);
  if (!host?.trim() || !portNum || portNum < 1 || !username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Faltan campos requeridos o inválidos' });
  }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: portNum,
      secure: encryption === 'SSL',
      auth: { user: username.trim(), pass: password },
    });
    await transporter.verify();
    res.json({ ok: true, message: 'Conexión exitosa' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/smtp-config/send-test-email - enviar email de prueba
app.post('/admin/smtp-config/send-test-email', authMiddleware, requireRole('admin'), async (req, res) => {
  const { host, port, username, password, encryption } = req.body;
  const portNum = parseInt(port, 10);
  if (!host?.trim() || !portNum || portNum < 1 || !username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Faltan campos requeridos o inválidos' });
  }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: portNum,
      secure: encryption === 'SSL',
      auth: { user: username.trim(), pass: password },
    });

    const mailOptions = {
      from: username.trim(),
      to: req.user.email,
      subject: '✉️ Email de Prueba - SisTesis',
      html: `
        <h2>Hola ${req.user.full_name}</h2>
        <p>Este es un email de prueba desde SisTesis.</p>
        <p>Si recibiste este mensaje, tu configuración SMTP está funcionando correctamente.</p>
        <br>
        <p><strong>Detalles del servidor:</strong></p>
        <ul>
          <li>Servidor: ${host}</li>
          <li>Puerto: ${portNum}</li>
          <li>Usuario: ${username}</li>
          <li>Encriptación: ${encryption}</li>
        </ul>
        <br>
        <p>Sistema SisTesis</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ ok: true, message: `Email de prueba enviado a ${req.user.email}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/smtp-config - guardar configuración SMTP
app.post('/admin/smtp-config', authMiddleware, requireRole('admin'), (req, res) => {
  const { host, port, username, password, encryption, is_default } = req.body;
  const portNum = parseInt(port, 10);
  if (!host?.trim() || !portNum || portNum < 1 || !username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Faltan campos requeridos o inválidos' });
  }

  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const isDefault = is_default ? 1 : 0;
  try {
    // Si se marca como default, quitar default de las demás
    if (isDefault) db.prepare('UPDATE smtp_config SET is_default = 0').run();
    // Eliminar config anterior del usuario
    db.prepare('DELETE FROM smtp_config WHERE user_id = ?').run(req.user.id);
    // Crear nueva config
    db.prepare(`
      INSERT INTO smtp_config (id, user_id, host, port, username, password, encryption, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, host.trim(), portNum, username.trim(), password, encryption || 'TLS', isDefault, now, now);
    res.json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/notifications - obtener historial de notificaciones
app.get('/admin/notifications', authMiddleware, requireRole('admin'), (req, res) => {
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(req.user.id).map(r => r.role);
  const isSuperadmin = roles.includes('superadmin');
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  let programFilter = '';
  let programParams = [];
  if (!isSuperadmin) {
    const adminPrograms = db.prepare('SELECT program_id FROM program_admins WHERE user_id = ?').all(req.user.id).map(r => r.program_id);
    if (adminPrograms.length === 0) {
      return res.json({ notifications: [], total: 0, totalSent: 0, totalFailed: 0 });
    }
    const ph = adminPrograms.map(() => '?').join(',');
    programFilter = `WHERE (n.related_thesis_id IS NULL OR n.related_thesis_id IN (
      SELECT DISTINCT thesis_id FROM thesis_programs WHERE program_id IN (${ph})
    ))`;
    programParams = adminPrograms;
  }

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN sent_at IS NOT NULL AND error IS NULL THEN 1 ELSE 0 END) as totalSent,
      SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as totalFailed
    FROM notifications n
    ${programFilter}
  `).get(...programParams);
  const notifications = db.prepare(`
    SELECT n.*, u.full_name, u.email FROM notifications n
    LEFT JOIN users u ON u.id = n.user_id
    ${programFilter}
    ORDER BY n.created_at DESC LIMIT ? OFFSET ?
  `).all(...programParams, limit, offset);
  res.json({ notifications, total: totals.total, totalSent: totals.totalSent, totalFailed: totals.totalFailed });
});

// reenvía un mensaje fallido o pendiente
app.post('/admin/notifications/:id/resend', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  if (!notif) return res.status(404).json({ error: 'not found' });
  const user = db.prepare('SELECT institutional_email FROM users WHERE id = ?').get(notif.user_id);
  if (!user || !user.institutional_email) return res.status(400).json({ error: 'no recipient email' });

  try {
    const success = await sendEmail(db, user.institutional_email, notif.subject, notif.body, null);
    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE notifications SET sent_at = ?, error = ? WHERE id = ?')
      .run(success ? now : null, success ? null : 'failed', id);
    res.json({ ok: true, success });
  } catch (err) {
    console.error('[resend notification] error', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/notifications/send-custom - enviar mensaje personalizado a un usuario
app.post('/admin/notifications/send-custom', authMiddleware, requireRole('admin'), async (req, res) => {
  const { userId, subject, body } = req.body;
  if (!userId || !subject || !body) return res.status(400).json({ error: 'userId, subject y body son requeridos' });
  const user = db.prepare('SELECT id, institutional_email, full_name FROM users WHERE id = ?').get(userId);
  if (!user || !user.institutional_email) return res.status(400).json({ error: 'Usuario no encontrado o sin email' });
  try {
    const success = await sendEmail(db, user.institutional_email, subject, body, null);
    logNotification(db, userId, 'custom', subject, body, null, success ? null : 'failed');
    res.json({ ok: true, success });
  } catch (err) {
    console.error('[send-custom notification] error', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /notifications - obtener mis notificaciones
app.get('/notifications', authMiddleware, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(notifications);
});

// POST /notifications/:id/read - marcar como leída
app.post('/notifications/:id/read', authMiddleware, (req, res) => {
  const notifId = req.params.id;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(notifId, req.user.id);
  res.json({ ok: true });
});

// ============================================================================
// EXPORTACIÓN CSV DE TESIS
// ============================================================================

app.get('/admin/reports/theses', authMiddleware, requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT
      t.title,
      t.status,
      t.created_at,
      GROUP_CONCAT(DISTINCT us.full_name) AS students,
      GROUP_CONCAT(DISTINCT ue.full_name) AS evaluators,
      GROUP_CONCAT(DISTINCT p.name) AS programs,
      MAX(te.due_date) AS due_date
    FROM theses t
    LEFT JOIN thesis_students ts ON ts.thesis_id = t.id
    LEFT JOIN users us ON us.id = ts.student_id
    LEFT JOIN thesis_evaluators te ON te.thesis_id = t.id
    LEFT JOIN users ue ON ue.id = te.evaluator_id
    LEFT JOIN thesis_programs tp ON tp.thesis_id = t.id
    LEFT JOIN programs p ON p.id = tp.program_id
    WHERE t.status != 'deleted'
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `).all();

  const STATUS_LABELS = {
    draft: 'Borrador', submitted: 'Enviada', evaluators_assigned: 'Evaluadores asignados',
    revision_cuidados: 'Rev. con cuidados', revision_minima: 'Rev. mínima',
    sustentacion: 'Sustentación', finalized: 'Finalizada',
  };

  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Título', 'Estado', 'Estudiantes', 'Evaluadores', 'Programas', 'Fecha envío', 'Fecha límite evaluación'];
  const lines = rows.map(r => [
    escape(r.title),
    escape(STATUS_LABELS[r.status] || r.status),
    escape(r.students || ''),
    escape(r.evaluators || ''),
    escape(r.programs || ''),
    escape(r.created_at ? new Date(r.created_at * 1000).toLocaleDateString('es-CO') : ''),
    escape(r.due_date ? new Date(r.due_date * 1000).toLocaleDateString('es-CO') : ''),
  ].join(','));

  const csv = '\uFEFF' + [header.join(','), ...lines].join('\n'); // BOM para Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tesis-${Date.now()}.csv"`);
  res.send(csv);
});

// ============================================================================

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
  logger.errorLog(err, req);

  // Manejo específico de errores de multer (subida de archivos)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Archivo demasiado grande. Máximo 100MB permitido.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Tipo de archivo no permitido.' });
  }

  // Manejo de errores de validación express-validator
  if (err.array) {
    return res.status(400).json({ error: 'Datos de entrada inválidos', details: err.array() });
  }

  // Error por defecto
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Middleware para rutas no encontradas
app.use((req, res) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  // Verificar conexión a base de datos
  let dbStatus = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch (err) {
    dbStatus = 'error';
    console.error('Database health check failed:', err.message);
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime)}s`,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
    },
    database: dbStatus,
    version: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on http://0.0.0.0:${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    healthCheckUrl: `http://localhost:${PORT}/health`
  });
  startReminderCron(db);
  startBackupCron(process.env.DB_PATH || '/app/data/data.sqlite');
});
