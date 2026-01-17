import { execFile } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import { log } from '@test/util/logger';

const execFileAsync = promisify(execFile);

const hasCommand = async (command: string): Promise<boolean> => {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    log.warn(`Command "${command}" is not available. Skip capturing Xvfb screenshot.`);
    return false;
  }
};

const captureXvfbScreenshot = async (outputPath: string): Promise<void> => {
  const display: string | undefined = process.env.DISPLAY;
  if (!display) {
    log.warn('DISPLAY env is not set. Skip capturing Xvfb screenshot.');
    return;
  }
  if (!(await hasCommand('xwd'))) {
    return;
  }
  const pngPath: string = outputPath.endsWith('.png')
    ? outputPath
    : `${outputPath}.png`;
  const xwdPath: string = `${pngPath}.xwd`;

  try {
    await execFileAsync('xwd', [
      '-display',
      display,
      '-root',
      '-silent',
      '-out',
      xwdPath,
    ]);
  } catch (error) {
    log.warn('Failed to run xwd for Xvfb screenshot.', error);
    return;
  }

  try {
    await execFileAsync('convert', [xwdPath, pngPath]);
    await fsPromises.unlink(xwdPath);
  } catch (error) {
    log.warn(
      `convert command unavailable; raw XWD screenshot saved at ${xwdPath}`,
      error,
    );
  }
};

const SCREENSHOT_RETRY_COUNT = 3;
const SCREENSHOT_RETRY_DELAY_MS = 1_000;

export const retryScreenshotCapture = async <T>(
  action: () => Promise<T>,
  description: string,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SCREENSHOT_RETRY_COUNT; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      log.warn(
        `Screenshot capture failed (${description}) attempt ${attempt}/${SCREENSHOT_RETRY_COUNT}`,
        error,
      );
      if (attempt === SCREENSHOT_RETRY_COUNT) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_RETRY_DELAY_MS));
    }
  }
  throw lastError ?? new Error('Screenshot capture failed');
};

export const waitForPageLoad = async (page: Page): Promise<void> => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('load');
};

export const capturePageScreenshotWithRetry = async (
  page: Page,
  testInfo: TestInfo,
  fileName: string,
  description: string,
  options?: { fullPage?: boolean },
): Promise<void> => {
  await waitForPageLoad(page);
  await retryScreenshotCapture(
    () =>
      page.screenshot({
        path: testInfo.outputPath(fileName),
        fullPage: options?.fullPage ?? false,
      }),
    description,
  );
  log.info(`Screenshot captured: ${fileName} (${description})`);
};

export const captureXvfbScreenshotWithRetry = async (
  testInfo: TestInfo,
  fileName: string,
  description: string,
): Promise<void> =>
  retryScreenshotCapture(
    () => captureXvfbScreenshot(testInfo.outputPath(fileName)),
    description,
  ).then(() => {
    log.info(`Xvfb screenshot captured: ${fileName} (${description})`);
  });
