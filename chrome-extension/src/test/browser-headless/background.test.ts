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
import log from '@test/util/logger.js';
import {
  createBrowserTestObserver,
} from '@test/util/log-capture/browser-test-observer';
import {
  capturePageScreenshotWithRetry,
} from '@test/util/screenshot';
import {
  createTestTab,
  getOrWaitPopupPage,
  triggerExtensionClick,
} from '@test/util/extension-action.js';
import {
  startTestWebServer,
  type TestWebServer,
} from '@test/util/web-server/server';

const extensionRoot: string = resolve(__dirname, '../../..');
const extensionDist: string = resolve(extensionRoot, '..', 'dist', 'chrome-extension');
// headlessテストはログインCookieを設定せず、非ログイン状態でのXのリダイレクトを検証する。

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
  await extensionsPage.waitForLoadState('domcontentloaded');
  await capturePageScreenshotWithRetry(
    extensionsPage,
    testInfo,
    'extensions-page-1.png',
    'extensions page screenshot',
    { fullPage: true },
  );

  const shareTargetPage: Page = await context.newPage();
  await shareTargetPage.goto(shareTargetUrl);
  await shareTargetPage.bringToFront();
  await shareTargetPage.waitForLoadState('domcontentloaded');
  const shareTargetTab: chrome.tabs.Tab = await createTestTab(shareTargetPage);
  await capturePageScreenshotWithRetry(
    shareTargetPage,
    testInfo,
    'extensions-page-2.png',
    'share target page screenshot',
    { fullPage: true },
  );

  const pagesBeforeClick: ReadonlySet<Page> = new Set(context.pages());
  const popupPagePromise: Promise<Page | undefined> = context
    .waitForEvent('page', {
      predicate: (page) => !pagesBeforeClick.has(page),
    })
    .catch(() => undefined);
  await triggerExtensionClick(serviceWorker, shareTargetTab);
  await capturePageScreenshotWithRetry(
    shareTargetPage,
    testInfo,
    'extensions-page-3.png',
    'share target page screenshot after click',
    { fullPage: true },
  );
  const popupPage: Page = await getOrWaitPopupPage(
    context,
    pagesBeforeClick,
    popupPagePromise,
  );
  observer.attachPage(popupPage);
  await popupPage.waitForLoadState('domcontentloaded');
  log.info("popup page url before screenshot:", popupPage.url());
  log.info("capturing popup page screenshot");
  await capturePageScreenshotWithRetry(
    popupPage,
    testInfo,
    'extensions-page-4.png',
    'popup page screenshot',
    { fullPage: true },
  );
  log.info("popup page url before assertion:", popupPage.url());
  const popupUrl = new URL(popupPage.url());
  const redirectAfterLogin = popupUrl.searchParams.get('redirect_after_login');
  log.info("redirect_after_login:", redirectAfterLogin);
  const intentPostUrl = new URL(redirectAfterLogin ?? '', 'https://x.com');
  const intentPostPath = intentPostUrl.origin + intentPostUrl.pathname;
  expect(intentPostPath).toBe('https://x.com/intent/post');
  const popupText = intentPostUrl.searchParams.get('text');
  expect(popupText).toContain('TEST_PAGE_TITLE');
  expect(popupText).toContain(shareTargetUrl);
  log.info("finish");

  await popupPage.close();
  await shareTargetPage.close();
  await extensionsPage.close();
};

test.describe('Chrome extension background script', () => {
  if (!existsSync(extensionDist)) {
    throw new Error('ビルド済みの拡張機能が存在しません');
  }

  test('共有ターゲットのポップアップを検証する（非ログイン）', async ({ page: _ }, testInfo) => {
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
        `${testWebServer.url}/test.html`
      );
    } finally {
      detachUnhandledRejection();
      if (context) {
        log.info("closing browser context");
        await context.close();
      }
      if (testWebServer) {
        log.info("closing test web server");
        await testWebServer.close();
      }
    }
    observer.assertNoCapturedErrors("[x-post-button]");
  });
});
