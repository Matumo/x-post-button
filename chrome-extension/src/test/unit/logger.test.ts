import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '@test/util/logger.js';
log.debug("test logger.test.ts");

describe('logger挙動検証', () => {
  beforeEach(() => {
    // リセット
    vi.resetModules();
    // Mock
    const originalConsole = globalThis.console;
    const stubConsole = {
      error: vi.fn((...args: unknown[]) => originalConsole.error(...args)),
      warn: vi.fn((...args: unknown[]) => originalConsole.warn(...args)),
      info: vi.fn((...args: unknown[]) => originalConsole.info(...args)),
      log: vi.fn((...args: unknown[]) => originalConsole.log(...args)),
      debug: vi.fn((...args: unknown[]) => originalConsole.debug(...args)),
    } as unknown as Console;
    vi.stubGlobal('console', stubConsole);
  });

  afterEach(() => {
    // 後片付け
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ブラウザーのエラーと未処理の拒否をロガー経由で出力する', async () => {
    // addEventListenerをモックし、登録されたリスナーを取得できるようにする
    const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};
    vi.stubGlobal(
      'addEventListener',
      (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners[type] = listeners[type] ?? [];
        listeners[type]!.push(listener);
      },
    );

    // インポート
    const { log } = await import('@main/util/logger');
    const errorSpy = vi.spyOn(log, 'error');

    const errorListener = listeners.error?.[0] as (event: ErrorEvent) => void;
    const rejectionListener = listeners.unhandledrejection?.[0] as (event: PromiseRejectionEvent) => void;
    const thrownError = new Error('boom');

    // errorプロパティありの場合（Errorオブジェクトを優先）
    errorListener?.({ error: thrownError, message: thrownError.message } as unknown as ErrorEvent);
    // errorプロパティなしの場合（messageフィールドを利用）
    errorListener?.({ message: 'fallback' } as unknown as ErrorEvent);
    // Promiseの未処理拒否
    rejectionListener?.({ reason: 'nope' } as unknown as PromiseRejectionEvent);

    expect(errorSpy).toHaveBeenCalledWith('Unhandled error:', thrownError);
    expect(errorSpy).toHaveBeenCalledWith('Unhandled error:', 'fallback');
    expect(errorSpy).toHaveBeenCalledWith('Unhandled rejection:', 'nope');
  });

  it('NodeのuncaughtExceptionとunhandledRejectionをロガー経由で出力する', async () => {
    const listeners: Record<string, ((reason: unknown) => void)[]> = {};

    // process.onをスタブして、登録されたリスナーを記録する
    vi.stubGlobal('process', {
      ...process,
      on: (event: 'uncaughtException' | 'unhandledRejection', listener: (reason: unknown) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event]!.push(listener);
      },
    });

    const { log } = await import('@main/util/logger');
    const errorSpy = vi.spyOn(log, 'error');

    const uncaughtListener = listeners.uncaughtException?.[0];
    const unhandledListener = listeners.unhandledRejection?.[0];
    const thrownError = new Error('boom');

    // uncaughtException
    uncaughtListener?.(thrownError);
    // unhandledRejection
    unhandledListener?.('reason');

    expect(errorSpy).toHaveBeenCalledWith('Uncaught exception:', thrownError);
    expect(errorSpy).toHaveBeenCalledWith('Unhandled rejection:', 'reason');
  });

  it('process.onが存在しなくてもNode用ハンドラーが安全にスキップされる', async () => {
    vi.stubGlobal('process', {
      ...process,
      on: undefined,
    });
    const module = await import('@main/util/logger');
    expect(module.log).toBeDefined();
  });
});
