import { setDefaultConfig, setLoggerConfig, getLogger } from "ts-simple-logger";

setDefaultConfig({
  placeholders: { "%appName": "x-post-button" },
  prefixFormat: "[%appName] (%loggerName) %logLevel:"
});
setLoggerConfig("test", {
  level: "debug"
});
const log = getLogger("test");

const handleBrowserErrors = (): void => {
  if (typeof globalThis.addEventListener !== 'function') {
    return;
  }
  globalThis.addEventListener('error', (event: ErrorEvent): void => {
    const detail = event.error ?? event.message;
    log.error('Unhandled error:', detail);
  });
  globalThis.addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void => {
    log.error('Unhandled rejection:', event.reason);
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
    log.error('Uncaught exception:', error);
  });
  process.on('unhandledRejection', (reason: unknown): void => {
    log.error('Unhandled rejection:', reason);
  });
};
handleNodeErrors();

export { log };
export default log;
