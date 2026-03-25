const winston = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom log format for console
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
  return `[${timestamp}] ${level}: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports: [
    // Console output
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
    // File: all logs
    new winston.transports.File({
      filename: path.join('logs', 'app.log'),
      format: combine(timestamp(), json()),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    // File: errors only
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      format: combine(timestamp(), json()),
    }),
  ],
});

module.exports = logger;
