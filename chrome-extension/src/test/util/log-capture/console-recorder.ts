import type { ConsoleMessage } from '@playwright/test';
import log from '@test/util/logger';
import { formatConsoleMessage } from './console-message-formatter.js';

type ConsoleErrorPayload<Source extends string> = {
  source: Source;
  kind: 'console-error';
  message: string;
};

export const createConsoleRecorder = <Source extends string>(
  pushCapturedError: (err: ConsoleErrorPayload<Source>) => void,
): ((source: Source) => (msg: ConsoleMessage) => void) => {
  return (source: Source) => (msg: ConsoleMessage): void => {
    void (async (): Promise<void> => {
      try {
        const text: string = await formatConsoleMessage(msg);
        if (msg.type() === 'error') {
          pushCapturedError({
            source,
            kind: 'console-error',
            message: text,
          });
        }
        log.info(`(${source}-log)`, `-----`, text);
      } catch (error) {
        log.warn(`Failed to record console message from ${source}`, error);
      }
    })();
  };
};
