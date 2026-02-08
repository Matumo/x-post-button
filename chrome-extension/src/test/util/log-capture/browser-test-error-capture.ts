import { expect, type Page, type Worker } from '@playwright/test';
import { createCapturedErrorPusher } from './captured-error-pusher.js';
import { createChromeExtensionStackMapper } from './stacktrace-mapper.js';
import { createConsoleRecorder } from './console-recorder.js';
import { createErrorRecorder } from './error-recorder.js';

export type CapturedError = {
  source: 'sw' | 'page' | 'node';
  kind:
    | 'console-error'
    | 'pageerror'
    | 'crash'
    | 'unhandledRejection'
    | 'test-error';
  message: string;
  mappedMessage?: string;
  stack?: string;
  mappedStack?: string;
};

export const createBrowserTestErrorCapture = (extensionDist: string) => {
  const capturedErrors: CapturedError[] = [];
  const mapStackText = createChromeExtensionStackMapper(extensionDist);
  const pushCapturedError = createCapturedErrorPusher(capturedErrors, mapStackText);

  const recordConsole = createConsoleRecorder<CapturedError['source']>(
    pushCapturedError,
  );
  const createRecorders = createErrorRecorder<CapturedError['source']>(
    pushCapturedError,
  );
  const pageErrorRecorder = createRecorders('page');
  const nodeErrorRecorder = createRecorders('node');

  const attachUnhandledRejection = (): (() => void) => {
    const handler = nodeErrorRecorder.recordUnhandledRejection;
    process.on('unhandledRejection', handler);
    return () => process.off('unhandledRejection', handler);
  };

  const attachPage = (page: Page): void => {
    page.on('console', recordConsole('page'));
    page.on('pageerror', pageErrorRecorder.recordPageError);
    page.on('crash', pageErrorRecorder.recordCrash);
  };

  const attachServiceWorker = (worker: Worker): void => {
    worker.on('console', recordConsole('sw'));
    // Service worker currently does not expose pageerror/crash equivalents.
  };

  /**
   * prefix指定で、prefixが一致しないログは除外して検証する
   * @param prefix 検証対象とするエラーメッセージのprefix（省略可）
   */
  const assertNoCapturedErrors = (prefix?: string): void => {
    let filtered = capturedErrors;
    if (prefix) {
      filtered = capturedErrors.filter(e => e.message.startsWith(prefix));
    }
    expect(
      filtered,
      prefix
        ? `${prefix} で始まるブラウザのコンソールエラーまたは例外が発生`
        : 'ブラウザでコンソールエラーまたは例外が発生',
    ).toEqual([]);
  };

  const pushTestError = (error: { message: string; stack?: string }): void => {
    pushCapturedError({
      source: 'node',
      kind: 'test-error',
      message: error.message,
      ...(error.stack ? { stack: error.stack } : null),
    });
  };

  return {
    capturedErrors,
    recordConsole,
    attachUnhandledRejection,
    attachPage,
    attachServiceWorker,
    assertNoCapturedErrors,
    pushTestError,
  };
};
