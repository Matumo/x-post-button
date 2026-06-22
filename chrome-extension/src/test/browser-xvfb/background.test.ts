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
import { waitForExtensionServiceWorker } from '@test/util/log-capture/extension-service-worker';
import {
  startTestWebServer,
  type TestWebServer,
} from '@test/util/web-server/server';
import {
  capturePageScreenshotWithRetry,
  captureXvfbScreenshotWithRetry,
} from '@test/util/screenshot.js';
import { applyLoginCookiesFromEnv } from '@test/util/login-cookies.js';
import {
  createTestTab,
  getOrWaitPopupPage,
  triggerExtensionClick,
} from '@test/util/extension-action.js';
import {
  calculateScreenshotStats,
  detectNestedRectangles,
  rectangleHeight,
  rectangleWidth,
} from '@test/util/image/screenshot-analysis.js';

const extensionRoot: string = resolve(__dirname, '../../..');
const extensionDist: string = resolve(extensionRoot, '..', 'dist', 'chrome-extension');
// ログインが必要なテストを実行する場合はLOGIN_TEST=1とLOGIN_COOKIES_TEXTを環境変数に設定する。
const shouldRunLoginTest: boolean = process.env.LOGIN_TEST === '1';
const loginTestNameSuffix: string = shouldRunLoginTest ? 'ログイン' : '非ログイン';

async function setWindowSize(context: BrowserContext, page: Page,
                             width: number, height: number,
                             left: number, top: number) {
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', {
    windowId,
    bounds: { windowState: 'normal', width, height, left, top },
  });
}

const runShareTargetFlow = async (
  testInfo: TestInfo,
  observer: ReturnType<typeof createBrowserTestObserver>,
  context: BrowserContext,
  serviceWorker: Worker,
  shareTargetUrl: string,
): Promise<void> => {
  const page: Page = await context.newPage();
  observer.attachPage(page);

  // 拡張機能アイコンのクリックを発火させるために通常のタブを開く
  await setWindowSize(context, page, 1000, 1080, 30, 30);
  await page.goto(shareTargetUrl);
  await page.bringToFront();

  await capturePageScreenshotWithRetry(
    page,
    testInfo,
    'ss1.png',
    'share target page screenshot',
  );
  const activeTab: chrome.tabs.Tab = await createTestTab(page);

  const pagesBeforeClick: ReadonlySet<Page> = new Set(context.pages());
  const popupPagePromise: Promise<Page | undefined> = context
    .waitForEvent('page', {
      predicate: (newPage) => !pagesBeforeClick.has(newPage),
    })
    .catch(() => undefined);

  await triggerExtensionClick(serviceWorker, activeTab);

  const popupPage: Page = await getOrWaitPopupPage(
    context,
    pagesBeforeClick,
    popupPagePromise,
  );
  log.info("popup page url:", popupPage.url());
  await capturePageScreenshotWithRetry(
    popupPage,
    testInfo,
    'ss2.png',
    'popup page screenshot',
  );
  await captureXvfbScreenshotWithRetry(
    testInfo,
    'ss3.png',
    'Xvfb screenshot',
  );

  const logScreenshotStats = async (): Promise<void> => {
    const screenshotFiles: string[] = ['ss1.png', 'ss2.png', 'ss3.png'];
    for (const fileName of screenshotFiles) {
      const filePath: string = testInfo.outputPath(fileName);
      if (!existsSync(filePath)) {
        log.warn(`Screenshot not found: ${filePath}`);
        continue;
      }
      const { width, height, pixelCount, redPixelCount } =
        await calculateScreenshotStats(filePath);
      log.info(
        `${fileName}: ${width}x${height}, pixels=${pixelCount}, redPixels=${redPixelCount}`,
      );
    }
  };
  await logScreenshotStats();

  const assertNestedRectanglesInXvfbShot = async (): Promise<void> => {
    const screenshotPath: string = testInfo.outputPath('ss3.png');
    if (!existsSync(screenshotPath)) {
      throw new Error('チェック対象のスクリーンショットが作成されていません');
    }
    const { redBounds, innerBounds } = await detectNestedRectangles(screenshotPath);
    const redWidth = rectangleWidth(redBounds);
    const redHeight = rectangleHeight(redBounds);
    const innerWidth = rectangleWidth(innerBounds);
    const innerHeight = rectangleHeight(innerBounds);
    log.info(
      `[rectangles] red=(${redBounds.minX},${redBounds.minY})-(${redBounds.maxX},${redBounds.maxY}) ${redWidth}x${redHeight}, inner=(${innerBounds.minX},${innerBounds.minY})-(${innerBounds.maxX},${innerBounds.maxY}) ${innerWidth}x${innerHeight}`,
    );
    // 汎用的なチェック
    // ページ左上座標
    expect(innerWidth).toBeGreaterThan(0);
    expect(innerHeight).toBeGreaterThan(0);
    // ポップアップ左上座標
    expect(innerBounds.minX).toBeGreaterThan(redBounds.minX);
    expect(innerBounds.minY).toBeGreaterThan(redBounds.minY);
    // ポップアップ右下座標
    expect(innerBounds.maxX).toBeLessThan(redBounds.maxX);
    expect(innerBounds.maxY).toBeLessThan(redBounds.maxY);
    // ページ右下座標
    expect(innerWidth).toBeLessThan(redWidth);
    expect(innerHeight).toBeLessThan(redHeight);
    // 厳密なチェック
    // ページ左上座標(30,30)
    expect(redBounds.minX).toBe(30);
    //expect(redBounds.minY).toBe(176); // 30 + ヘッダーサイズ
    const headerSize = redBounds.minY - 30;
    // ページ右下座標(1030-1,1080-1)
    expect(redBounds.maxX).toBe(1029);
    expect(redBounds.maxY).toBe(1079);
    // ページサイズ(1000,1080)
    expect(redWidth).toBe(1000);
    expect(redHeight).toBe(1080 - headerSize - 30); // 1080 - ヘッダサイズ - 30
    // ポップアップ左上座標(180,270)
    expect(innerBounds.minX).toBe(180);
    expect(innerBounds.minY).toBe(270);
    // ポップアップ右下座標(880-1,870-1)
    expect(innerBounds.maxX).toBe(879);
    expect(innerBounds.maxY).toBe(869);
    // ポップアップサイズ(700,600)
    expect(innerWidth).toBe(700);
    expect(innerHeight).toBe(600);
  };
  await assertNestedRectanglesInXvfbShot();

  const popupUrl = new URL(popupPage.url());
  const intentPostUrl = shouldRunLoginTest ? popupUrl
    : new URL(popupUrl.searchParams.get('redirect_after_login') ?? '', 'https://x.com');
  const intentPostPath = intentPostUrl.origin + intentPostUrl.pathname;
  expect(intentPostPath).toBe('https://x.com/intent/post');
  const popupText = intentPostUrl.searchParams.get('text');
  expect(popupText).toContain('TEST_PAGE_TITLE');
  expect(popupText).toContain(shareTargetUrl);
  if (shouldRunLoginTest) {
    const tweetTextarea_0 = popupPage.getByTestId('tweetTextarea_0');
    const popupContentState = await Promise.race([
      tweetTextarea_0.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'textarea' as const),
      popupPage.getByText(/Hmm.*this page doesn.t exist/)
        .waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'not-found' as const),
    ]);
    if (popupContentState === 'not-found') {
      const title = await popupPage.title();
      throw new Error("ポップアップのページが見つかりません。タイトル: " + title);
    }
    const value = await tweetTextarea_0.innerText();
    expect(value).toContain('TEST_PAGE_TITLE');
    expect(value).toContain(shareTargetUrl);
  }

  await popupPage.close();
  await page.close();
};

test.describe('Chrome extension background script', () => {
  if (!existsSync(extensionDist)) {
    throw new Error('ビルド済みの拡張機能が存在しません');
  }

  test('共有ターゲットのポップアップとスクリーンショットを検証する（' + loginTestNameSuffix + '）', async ({ page: _ }, testInfo) => {
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
        headless: false,
        viewport: null,
        args: [
          `--disable-extensions-except=${extensionDist}`,
          `--load-extension=${extensionDist}`,
        ],
      });
      await applyLoginCookiesFromEnv(context, shouldRunLoginTest);

      const serviceWorker: Worker = await waitForExtensionServiceWorker(context);
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
