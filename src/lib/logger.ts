type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export function createLogger(name: string) {
  return {
    error: (message: string, meta?: Record<string, unknown>) => 
      log('error', name, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => 
      log('warn', name, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => 
      log('info', name, message, meta),
    debug: (message: string, meta?: Record<string, unknown>) => 
      log('debug', name, message, meta)
  };
}

function log(level: LogLevel, name: string, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    service: name,
    message,
    ...meta
  };
  
  //const logString = JSON.stringify(logEntry, null, 2);
  const logString = JSON.stringify(logEntry);

  switch (level) {
    case 'error':
      console.error(logString);
      break;
    case 'warn':
      //console.warn(logString);
      console.error(logString);
      break;
    case 'info':
      //console.info(logString);
      console.error(logString);
      break;
    case 'debug':
     // console.debug(logString);
     console.error(logString);
      break;
  }
}

export type Logger = ReturnType<typeof createLogger>;
