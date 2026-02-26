// Structured logger with colored output and module tagging

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

let globalLevel: LogLevel = 'info';

/**
 * Set the global log level threshold.
 */
export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

/**
 * Create a logger instance tagged with a module name.
 */
export function createLogger(module: string) {
  function log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[globalLevel]) return;

    const timestamp = new Date().toISOString();
    const color = COLORS[level];
    const prefix = `${DIM}${timestamp}${RESET} ${color}[${level.toUpperCase().padEnd(5)}]${RESET} ${DIM}(${module})${RESET}`;

    if (data !== undefined) {
      console.error(`${prefix} ${message}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } else {
      console.error(`${prefix} ${message}`);
    }
  }

  return {
    debug: (msg: string, data?: unknown) => log('debug', msg, data),
    info: (msg: string, data?: unknown) => log('info', msg, data),
    warn: (msg: string, data?: unknown) => log('warn', msg, data),
    error: (msg: string, data?: unknown) => log('error', msg, data),
  };
}
