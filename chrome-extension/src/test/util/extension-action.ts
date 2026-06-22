import type { BrowserContext, Page, Worker } from '@playwright/test';

export const createTestTab = async (page: Page): Promise<chrome.tabs.Tab> => ({
  active: true,
  autoDiscardable: true,
  discarded: false,
  frozen: false,
  groupId: -1,
  highlighted: true,
  incognito: false,
  index: 0,
  pinned: false,
  selected: true,
  title: await page.title(),
  url: page.url(),
  windowId: 1,
});

export const triggerExtensionClick = async (
  serviceWorker: Worker,
  tab: chrome.tabs.Tab,
): Promise<void> => {
  await serviceWorker.evaluate(async (clickedTab) => {
    // windowIdはテスト実行時の実ウィンドウに合わせる
    // backgroundはget(tab.windowId)を使う
    const focusedWindow = await chrome.windows.getLastFocused();
    chrome.action.onClicked.dispatch({
      ...clickedTab,
      windowId: focusedWindow.id ?? clickedTab.windowId,
    });
  }, tab);
};

const findNewPage = (
  context: BrowserContext,
  knownPages: ReadonlySet<Page>,
): Page | undefined =>
  context.pages().find((page) => !knownPages.has(page));

export const getOrWaitPopupPage = async (
  context: BrowserContext,
  knownPages: ReadonlySet<Page>,
  popupPagePromise: Promise<Page | undefined>,
): Promise<Page> => {
  const popupPage: Page | undefined =
    findNewPage(context, knownPages) ?? await popupPagePromise;
  if (!popupPage) {
    throw new Error('Popup page was not created');
  }
  return popupPage;
};
