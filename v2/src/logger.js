const { createLogger, format, transports } = require('winston');
const path = require('path');
const constants = require('./constants');
const fs = require('fs');

// Ensure log directory exists
if (!fs.existsSync(constants.paths.logsDir)) {
  fs.mkdirSync(constants.paths.logsDir, { recursive: true });
}

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      if (Object.keys(meta).length > 0) {
        log += `\n${JSON.stringify(meta, null, 2)}`;
      }
      return log;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(constants.paths.logsDir, 'app.log') })
  ],
});

module.exports = logger; 