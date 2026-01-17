import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
  type Worker,
} from '@playwright/test';
import { existsSync, mkdtempSync, promises as fsPromises } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
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

const extensionRoot: string = resolve(__dirname, '../../..');
const extensionDist: string = resolve(extensionRoot, '..', 'dist', 'chrome-extension');

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

type ScreenshotStats = {
  width: number;
  height: number;
  pixelCount: number;
  redPixelCount: number;
};

type RectangleBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
};

const createEmptyRectangleBounds = (): RectangleBounds => ({
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
  pixelCount: 0,
});

const expandRectangleBounds = (
  bounds: RectangleBounds,
  x: number,
  y: number,
): void => {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
  bounds.pixelCount += 1;
};

const isRectangleBoundsValid = (bounds: RectangleBounds): boolean =>
  Number.isFinite(bounds.minX) &&
  Number.isFinite(bounds.minY) &&
  Number.isFinite(bounds.maxX) &&
  Number.isFinite(bounds.maxY) &&
  bounds.pixelCount > 0;

const rectangleWidth = (bounds: RectangleBounds): number =>
  isRectangleBoundsValid(bounds)
    ? bounds.maxX - bounds.minX + 1
    : 0;

const rectangleHeight = (bounds: RectangleBounds): number =>
  isRectangleBoundsValid(bounds)
    ? bounds.maxY - bounds.minY + 1
    : 0;

const isRedPixel = (r: number, g: number, b: number, a: number): boolean =>
  r === 255 && g === 0 && b === 0 && a === 255;

const calculateScreenshotStats = async (filePath: string): Promise<ScreenshotStats> => {
  const fileBuffer = await fsPromises.readFile(filePath);
  const png = PNG.sync.read(fileBuffer);
  let pixelCount = 0;
  let redPixelCount = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    pixelCount += 1;
    if (isRedPixel(r, g, b, a)) {
      redPixelCount += 1;
    }
  }
  return {
    width: png.width,
    height: png.height,
    pixelCount,
    redPixelCount,
  };
};

type SearchArea = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const loadPng = async (filePath: string) => {
  const fileBuffer = await fsPromises.readFile(filePath);
  return PNG.sync.read(fileBuffer);
};

const findRedRectangleBounds = (data: Uint8Array, width: number, height: number): RectangleBounds => {
  const redBounds = createEmptyRectangleBounds();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (isRedPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        expandRectangleBounds(redBounds, x, y);
      }
    }
  }
  return redBounds;
};

const assertValidRedBounds = (redBounds: RectangleBounds): void => {
  if (!isRectangleBoundsValid(redBounds)) {
    throw new Error('赤色の領域を検出できませんでした');
  }
  if (redBounds.maxX - redBounds.minX < 2 || redBounds.maxY - redBounds.minY < 2) {
    throw new Error('赤色の領域が小さすぎて内側の判定ができません');
  }
};

const createInnerSearchArea = (redBounds: RectangleBounds): SearchArea => ({
  minX: redBounds.minX + 1,
  maxX: redBounds.maxX - 1,
  minY: redBounds.minY + 1,
  maxY: redBounds.maxY - 1,
});

const floodFillNonRedRegion = (
  startIndex: number,
  data: Uint8Array,
  width: number,
  searchArea: SearchArea,
  visited: Uint8Array,
): RectangleBounds => {
  const bounds = createEmptyRectangleBounds();
  const queue: number[] = [startIndex];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    const cy = Math.floor(current / width);
    const cx = current - cy * width;
    expandRectangleBounds(bounds, cx, cy);

    const neighbors: [number, number][] = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < searchArea.minX || nx > searchArea.maxX || ny < searchArea.minY || ny > searchArea.maxY) {
        continue;
      }
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) {
        continue;
      }
      const neighborOffset = neighborIndex * 4;
      if (isRedPixel(
        data[neighborOffset],
        data[neighborOffset + 1],
        data[neighborOffset + 2],
        data[neighborOffset + 3],
      )) {
        continue;
      }
      visited[neighborIndex] = 1;
      queue.push(neighborIndex);
    }
  }

  return bounds;
};

const collectInnerCandidates = (
  data: Uint8Array,
  width: number,
  height: number,
  searchArea: SearchArea,
): RectangleBounds[] => {
  const visited: Uint8Array = new Uint8Array(width * height);
  const candidates: RectangleBounds[] = [];

  for (let y = searchArea.minY; y <= searchArea.maxY; y += 1) {
    for (let x = searchArea.minX; x <= searchArea.maxX; x += 1) {
      const pointIndex = y * width + x;
      if (visited[pointIndex]) {
        continue;
      }
      const offset = pointIndex * 4;
      if (isRedPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        continue;
      }
      visited[pointIndex] = 1;
      const bounds = floodFillNonRedRegion(pointIndex, data, width, searchArea, visited);
      if (isRectangleBoundsValid(bounds)) {
        candidates.push(bounds);
      }
    }
  }

  return candidates;
};

const selectLargestCandidate = (candidates: RectangleBounds[]): RectangleBounds => {
  if (candidates.length === 0) {
    throw new Error('赤色領域内に赤以外の領域を検出できませんでした');
  }
  candidates.sort((a, b) => b.pixelCount - a.pixelCount);
  return candidates[0];
};

const detectNestedRectangles = async (
  filePath: string,
): Promise<{ redBounds: RectangleBounds; innerBounds: RectangleBounds }> => {
  const { width, height, data } = await loadPng(filePath);
  const redBounds = findRedRectangleBounds(data, width, height);
  assertValidRedBounds(redBounds);
  const searchArea = createInnerSearchArea(redBounds);
  const candidates = collectInnerCandidates(data, width, height, searchArea);
  const innerBounds = selectLargestCandidate(candidates);
  return { redBounds, innerBounds };
};

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

  const popupPagePromise: Promise<Page> = context.waitForEvent('page');

  await serviceWorker.evaluate(async () => {
    const activeTab: chrome.tabs.Tab = await new Promise<chrome.tabs.Tab>(
      (resolve, reject) => {
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
      },
    );

    const onClicked: { dispatch: (tab: chrome.tabs.Tab) => void } =
      chrome.action.onClicked as unknown as {
        dispatch: (tab: chrome.tabs.Tab) => void;
      };
    onClicked.dispatch(activeTab);
  });

  const popupPage: Page = await popupPagePromise;
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

  const assertSs4NestedRectangles = async (): Promise<void> => {
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
    const header_size = redBounds.minY - 30;
    // ページ右下座標(1030-1,1080-1)
    expect(redBounds.maxX).toBe(1029);
    expect(redBounds.maxY).toBe(1079);
    // ページサイズ(1000,1080)
    expect(redWidth).toBe(1000);
    expect(redHeight).toBe(1080 - header_size - 30); // 1080 - ヘッダサイズ - 30
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
  await assertSs4NestedRectangles();

  expect(popupPage.url()).toContain('https://x.com/intent/post');
  const tweetTextarea_0 = popupPage.getByTestId('tweetTextarea_0');
  const value = await tweetTextarea_0.innerText();
  expect(value).toContain('TEST_PAGE_TITLE');
  expect(value).toContain(shareTargetUrl);

  await popupPage.close();
  await page.close();
};

test.describe('Chrome extension background script', () => {
  if (!existsSync(extensionDist)) {
    throw new Error('ビルド済みの拡張機能が存在しません');
  }

  test('共有ターゲットのポップアップとスクリーンショットを検証する', async ({ page: _ }, testInfo) => {
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
