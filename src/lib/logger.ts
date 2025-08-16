// Simplified structured logging utility
// Clean, simple logging without over-engineering

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const shouldLog = () => {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production';
};

const log = (level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) => {
  if (!shouldLog()) return;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...context,
    ...(error && { error: { message: error.message, stack: error.stack, name: error.name } }),
  };

  switch (level) {
    case 'INFO':
      console.info(`💡 ${message}`, logEntry);
      break;
    case 'WARN':
      console.warn(`⚠️ ${message}`, logEntry);
      break;
    case 'ERROR':
      console.error(`❌ ${message}`, logEntry);
      break;
    case 'DEBUG':
      if (process.env.NODE_ENV === 'development') {
        console.debug(`🐛 ${message}`, logEntry);
      }
      break;
  }
};

// Basic logging functions
export const logInfo = (message: string, context?: Record<string, unknown>) => log('INFO', message, context);
export const logWarn = (message: string, context?: Record<string, unknown>) => log('WARN', message, context);
export const logError = (message: string, error?: Error, context?: Record<string, unknown>) => log('ERROR', message, context, error);
export const logDebug = (message: string, context?: Record<string, unknown>) => log('DEBUG', message, context);

// Common logging patterns
export const logApiRequest = (method: string, endpoint: string, context?: Record<string, unknown>) =>
  logInfo(`API: ${method} ${endpoint}`, { method, endpoint, ...context });

export const logSlackEvent = (eventType: string, context?: Record<string, unknown>) =>
  logInfo(`Slack: ${eventType}`, { event_type: eventType, ...context });

export const logApiSuccess = (message: string, context?: Record<string, unknown>) =>
  logInfo(`API Success: ${message}`, context);

export const logApiError = (message: string, error: Error, context?: Record<string, unknown>) =>
  logError(`API Error: ${message}`, error, context);