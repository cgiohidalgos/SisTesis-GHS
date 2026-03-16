const fs = require('fs');
const path = require('path');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Logger simple pero estructurado
class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };
    this.currentLevel = process.env.LOG_LEVEL || 'info';
    this.levelValue = this.levels[this.currentLevel] || 2;
  }

  _shouldLog(level) {
    return this.levels[level] <= this.levelValue;
  }

  _formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

    // Agregar metadata si existe
    if (Object.keys(meta).length > 0) {
      return baseMessage + ` | ${JSON.stringify(meta)}`;
    }

    return baseMessage;
  }

  _writeToFile(level, message) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(logsDir, `${level}-${today}.log`);
      const logEntry = `[${new Date().toISOString()}] ${message}\n`;

      fs.appendFileSync(logFile, logEntry);
    } catch (err) {
      console.error('Error writing to log file:', err);
    }
  }

  error(message, meta) {
    if (!this._shouldLog('error')) return;
    const formatted = this._formatMessage('error', message, meta);
    console.error('\x1b[31m' + formatted + '\x1b[0m'); // Red
    this._writeToFile('error', formatted);
  }

  warn(message, meta) {
    if (!this._shouldLog('warn')) return;
    const formatted = this._formatMessage('warn', message, meta);
    console.warn('\x1b[33m' + formatted + '\x1b[0m'); // Yellow
    this._writeToFile('error', formatted); // Warnings also go to error log
  }

  info(message, meta) {
    if (!this._shouldLog('info')) return;
    const formatted = this._formatMessage('info', message, meta);
    console.log('\x1b[36m' + formatted + '\x1b[0m'); // Cyan
    this._writeToFile('combined', formatted);
  }

  http(message, meta) {
    if (!this._shouldLog('http')) return;
    const formatted = this._formatMessage('http', message, meta);
    console.log('\x1b[35m' + formatted + '\x1b[0m'); // Magenta
    this._writeToFile('http', formatted);
  }

  debug(message, meta) {
    if (!this._shouldLog('debug')) return;
    const formatted = this._formatMessage('debug', message, meta);
    console.log('\x1b[34m' + formatted + '\x1b[0m'); // Blue
    this._writeToFile('combined', formatted);
  }

  // Middleware para logging HTTP
  httpLog(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const user = req.user ? req.user.id : 'anonymous';

      this.http(`${req.method} ${req.originalUrl}`, {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: `${duration}ms`,
        user,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    });

    next();
  }

  // Función helper para logging de errores
  errorLog(err, req = null) {
    const errorInfo = {
      message: err.message,
      stack: err.stack,
      url: req ? req.originalUrl : null,
      method: req ? req.method : null,
      user: req && req.user ? req.user.id : 'anonymous',
      timestamp: new Date().toISOString()
    };

    this.error('Application Error', errorInfo);
  }
}

const logger = new Logger();
module.exports = logger;