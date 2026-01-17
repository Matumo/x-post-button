import type { BrowserContext, Worker } from '@playwright/test';
import { log } from '@test/util/logger';

const EXTENSION_BACKGROUND_PATH_SUFFIX = '/src/main/background.js';

const isExtensionServiceWorker = (worker: Worker): boolean => {
  const url: string | undefined = worker.url();
  if (!url) {
    return false;
  }
  return (
    url.startsWith('chrome-extension://') &&
    url.endsWith(EXTENSION_BACKGROUND_PATH_SUFFIX)
  );
};

export const waitForExtensionServiceWorker = async (
  context: BrowserContext,
  timeoutMs: number = 30_000,
): Promise<Worker> => {
  const existingWorker: Worker | undefined = context
    .serviceWorkers()
    .find(isExtensionServiceWorker);
  if (existingWorker) {
    log.info('Detected extension service worker:', existingWorker.url());
    return existingWorker;
  }

  log.info('Waiting for extension service worker to register...');
  try {
    const worker: Worker = await context.waitForEvent('serviceworker', {
      predicate: isExtensionServiceWorker,
      timeout: timeoutMs,
    });
    log.info('Extension service worker registered:', worker.url());
    return worker;
  } catch (error) {
    const reason: string =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `拡張機能の Service Worker を検出できませんでした: ${reason}`,
    );
  }
};
