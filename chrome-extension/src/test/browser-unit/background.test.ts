import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
  type Worker,
} from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import log from '../util/logger.js';
import {
  createBrowserTestObserver,
} from '@test/util/log-capture/browser-test-observer';
import {
  capturePageScreenshotWithRetry,
} from '@test/util/screenshot';
import {
  startTestWebServer,
  type TestWebServer,
} from '../util/web-server/server';

const extensionRoot: string = resolve(__dirname, '../../..');
const extensionDist: string = resolve(extensionRoot, '..', 'dist', 'chrome-extension');

const triggerExtensionClick = async (serviceWorker: Worker): Promise<void> => {
  await serviceWorker.evaluate(async () => {
    const activeTab: chrome.tabs.Tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs: chrome.tabs.Tab[]) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const tab: chrome.tabs.Tab | undefined = tabs[0];
          if (!tab) {
            reject(new Error('No active tab found'));
            return;
          }
          resolve(tab);
        },
      );
    });

    const onClicked: { dispatch: (tab: chrome.tabs.Tab) => void } =
      chrome.action.onClicked as unknown as {
        dispatch: (tab: chrome.tabs.Tab) => void;
      };
    onClicked.dispatch(activeTab);
  });
};

const getOrWaitServiceWorker = async (
  context: BrowserContext,
): Promise<Worker> => {
  let serviceWorker: Worker | undefined = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
};

const runShareTargetFlow = async (
  testInfo: TestInfo,
  observer: ReturnType<typeof createBrowserTestObserver>,
  context: BrowserContext,
  serviceWorker: Worker,
  shareTargetUrl: string,
): Promise<void> => {
  const extensionsPage: Page = await context.newPage();
  observer.attachPage(extensionsPage);

  const shareTargetPage: Page = await context.newPage();
  await extensionsPage.waitForLoadState('domcontentloaded');
  await capturePageScreenshotWithRetry(
    extensionsPage,
    testInfo,
    'extensions-page-1.png',
    'extensions page screenshot',
    { fullPage: true },
  );
  await shareTargetPage.goto(shareTargetUrl);
  await shareTargetPage.bringToFront();

  await capturePageScreenshotWithRetry(
    shareTargetPage,
    testInfo,
    'extensions-page-2.png',
    'share target page screenshot',
    { fullPage: true },
  );

  const popupPagePromise: Promise<Page> = context.waitForEvent('page');

  await triggerExtensionClick(serviceWorker);

  await capturePageScreenshotWithRetry(
    shareTargetPage,
    testInfo,
    'extensions-page-3.png',
    'share target page screenshot after click',
    { fullPage: true },
  );

  const popupPage: Page = await popupPagePromise;
  observer.attachPage(popupPage);
  log.info("popup page url:", popupPage.url());
  await capturePageScreenshotWithRetry(
    popupPage,
    testInfo,
    'extensions-page-4.png',
    'popup page screenshot',
    { fullPage: true },
  );

  const browserPages: Page[] = context.pages();
  for (const [index, page] of browserPages.entries()) {
    await page.bringToFront();
    await page.screenshot({
      path: testInfo.outputPath(`browser-full-${index + 1}.png`),
      fullPage: true,
    });
  }

  expect(popupPage.url()).toContain('https://x.com/intent/post');
  await popupPage.close();
  await shareTargetPage.close();
};

test.describe('Chrome extension background script', () => {
  if (!existsSync(extensionDist)) {
    throw new Error('ビルド済みの拡張機能が存在しません');
  }

  test('共有ターゲットのポップアップを検証する', async ({ page: _ }, testInfo) => {
    const observer = createBrowserTestObserver(extensionDist);
    const detachUnhandledRejection = observer.attachUnhandledRejection();

    const userDataDir: string = mkdtempSync(
      join(tmpdir(), 'pw-chrome-user-data-'),
    );
    let context: BrowserContext | undefined;
    let testWebServer: TestWebServer | undefined;

    try {
      testWebServer = await startTestWebServer(extensionRoot);

      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        args: [
          `--disable-extensions-except=${extensionDist}`,
          `--load-extension=${extensionDist}`,
        ],
      });

      const serviceWorker: Worker = await getOrWaitServiceWorker(context);
      expect(serviceWorker).toBeTruthy();
      const serviceWorkerUrl: string | undefined = serviceWorker.url();
      log.info('service worker ready:', serviceWorkerUrl);

      observer.attachServiceWorker(serviceWorker);

      await runShareTargetFlow(
        testInfo,
        observer,
        context,
        serviceWorker,
        `${testWebServer.url}/test.html`,
      );
    } finally {
      detachUnhandledRejection();
      if (testWebServer) {
        await testWebServer.close();
      }
      await context?.close();
    }
    observer.assertNoCapturedErrors();
  });
});
