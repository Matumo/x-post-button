import { Logger } from 'tslog';

const LOGGER_NAME = 'app-test';
const LOG_LEVEL = 'debug';

const LOG_LEVELS = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
  off: 100,
} as const;

const logger = new Logger({
  name: LOGGER_NAME,
  minLevel: LOG_LEVELS[LOG_LEVEL],
  type: 'pretty',
});

const handleBrowserErrors = (): void => {
  if (typeof globalThis.addEventListener !== 'function') {
    return;
  }
  globalThis.addEventListener('error', (event: ErrorEvent): void => {
    const detail = event.error ?? event.message;
    logger.error('Unhandled error:', detail);
  });
  globalThis.addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void => {
    logger.error('Unhandled rejection:', event.reason);
  });
};
handleBrowserErrors();

declare const process:
  | {
      on: (event: 'uncaughtException' | 'unhandledRejection',
      listener: (reason: unknown) => void) => void;
    };
const handleNodeErrors = (): void => {
  const hasProcess = 'process' in globalThis;
  if (!hasProcess || typeof process.on !== 'function') {
    return;
  }
  process.on('uncaughtException', (error: unknown): void => {
    logger.error('Uncaught exception:', error);
  });
  process.on('unhandledRejection', (reason: unknown): void => {
    logger.error('Unhandled rejection:', reason);
  });
};
handleNodeErrors();

export { logger };
export default logger;
