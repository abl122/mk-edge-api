const { createLogger, format, transports } = require('winston');

function serializeError(err) {
  if (!(err instanceof Error)) return err;
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}

function safeStringify(value) {
  const seen = new WeakSet();

  try {
    return JSON.stringify(value, (key, current) => {
      const normalized = serializeError(current);

      if (normalized && typeof normalized === 'object') {
        if (seen.has(normalized)) {
          return '[Circular]';
        }
        seen.add(normalized);
      }

      return normalized;
    });
  } catch (error) {
    return JSON.stringify({
      logger_error: 'Falha ao serializar metadados de log',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'nova-api-mkedge' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaText = Object.keys(meta).length ? safeStringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaText}`;
        })
      ),
    }),
  ],
});

module.exports = logger;
