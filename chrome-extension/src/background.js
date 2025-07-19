const urlBase = 'https://x.com/intent/post';
const defaultSize = { width: 800, height: 600 };
const POPUP_MAX_SCREEN_RATIO = 0.7;

const getCurrentWindow = () => new Promise(r => chrome.windows.getCurrent({}, r));
const createWindow = opts => new Promise(r => chrome.windows.create(opts, r));
chrome.action.onClicked.addListener(async tab => {
  const url = `${urlBase}?text=${encodeURIComponent(tab.title)}%0A${encodeURIComponent(tab.url)}`;
  const win = await getCurrentWindow();
  const width = Math.min(defaultSize.width, Math.floor(POPUP_MAX_SCREEN_RATIO * win.width));
  const height = Math.min(defaultSize.height, Math.floor(POPUP_MAX_SCREEN_RATIO * win.height));
  await createWindow({
    type: 'popup',
    url: url,
    width: width,
    height: height,
    left: Math.round((win.width - width) / 2 + win.left),
    top: Math.round((win.height - height) / 2 + win.top),
  });
});
