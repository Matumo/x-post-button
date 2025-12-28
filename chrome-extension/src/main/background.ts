import log from '@main/util/logger';

type WindowBounds = { width: number; height: number; left: number; top: number };

const URL_BASE: string = 'https://x.com/intent/post';
const DEFAULT_SIZE: { width: number; height: number } = { width: 800, height: 600 };
const POPUP_MAX_SCREEN_RATIO: number = 0.7;

const buildShareUrl = (tab: chrome.tabs.Tab): string => {
  const title: string = tab.title ?? '';
  const pageUrl: string = tab.url ?? '';
  return `${URL_BASE}?text=${encodeURIComponent(title)}%0A${encodeURIComponent(pageUrl)}`;
};

const win2winBounds = (win: chrome.windows.Window): WindowBounds => ({
  width: win.width ?? DEFAULT_SIZE.width,
  height: win.height ?? DEFAULT_SIZE.height,
  left: win.left ?? 0,
  top: win.top ?? 0
});

const calcPopupBounds = (currentBounds: WindowBounds): WindowBounds => {
  const width: number = Math.min(DEFAULT_SIZE.width, Math.floor(POPUP_MAX_SCREEN_RATIO * currentBounds.width));
  const height: number = Math.min(DEFAULT_SIZE.height, Math.floor(POPUP_MAX_SCREEN_RATIO * currentBounds.height));
  const left: number = Math.round((currentBounds.width - width) / 2 + currentBounds.left);
  const top: number = Math.round((currentBounds.height - height) / 2 + currentBounds.top);
  return { width, height, left, top };
};

export const registerShareAction = (): void => {
  chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab): Promise<void> => {
    const url: string = buildShareUrl(tab);
    const winBounds: WindowBounds = win2winBounds(await chrome.windows.getCurrent());
    const popupBounds: WindowBounds = calcPopupBounds(winBounds);
    await chrome.windows.create({
      type: 'popup',
      url: url,
      width: popupBounds.width,
      height: popupBounds.height,
      left: popupBounds.left,
      top: popupBounds.top
    });
    log.info('Popup opened.', { url, winBounds, popupBounds });
  });
};

registerShareAction();
log.info('Background script initialized.');
