import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '@test/util/logger.js';
log.debug("test background.test.ts");

// テストで扱いやすいようにChrome提供の型を最小構成で再定義
type MockTab = {
  title?: string | null;
  url?: string | null;
};

type MockWindow = {
  width?: number | null;
  height?: number | null;
  left?: number | null;
  top?: number | null;
};

type OnClickedHandler = (tab: MockTab) => Promise<void> | void;

describe('background action handler', () => {
  let registeredHandler: OnClickedHandler | undefined;
  let addListenerMock: ReturnType<typeof vi.fn>;
  let getCurrentMock: ReturnType<typeof vi.fn>;
  let createWindowMock: ReturnType<typeof vi.fn>;

  // background.tsを読み込むたびにChrome API全体をモックし直す
  const loadBackgroundScript = async (): Promise<void> => {
    registeredHandler = undefined;

    addListenerMock = vi.fn((handler: OnClickedHandler) => {
      registeredHandler = handler;
    });

    getCurrentMock = vi.fn();
    createWindowMock = vi.fn();

    vi.stubGlobal('chrome', {
      action: {
        onClicked: {
          addListener: addListenerMock,
        },
      },
      windows: {
        getCurrent: getCurrentMock,
        create: createWindowMock,
      },
    });

    await import('@main/background');
  };

  // onClickedに登録されたハンドラを手動で呼び出し、単体テストとして扱う
  const triggerClick = async (tab: MockTab): Promise<void> => {
    if (!registeredHandler) {
      throw new Error('onClicked handler was not registered');
    }

    await registeredHandler(tab);
  };

  beforeEach(async () => {
    vi.resetModules();
    await loadBackgroundScript();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const shareTargetTab: MockTab = { title: 'Hello World', url: 'https://example.com/test?a=b#123' };
  // 正常系テスト
  const popupCases: Array<[string, MockWindow, { width: number; height: number; left: number; top: number }]> = [
    ['十分なウインドウサイズの場合', { width: 1200, height: 900, left: 100, top: 50 } satisfies MockWindow, { width: 800, height: 600, left: 300, top: 200 }],
    ['ウインドウサイズが大きすぎる場合', { width: 3000, height: 2000, left: 20, top: 30 } satisfies MockWindow, { width: 800, height: 600, left: 1120, top: 730 }],
    ['ウインドウサイズが小さすぎる場合', { width: 500, height: 400, left: 40, top: 60 } satisfies MockWindow, { width: 350, height: 280, left: 115, top: 120 }],
  ];
  it.each(popupCases)('正常系（%s）', async (_description, mockWindow, expected) => {
    // Mock
    getCurrentMock.mockResolvedValue(mockWindow);

    // 実行
    await triggerClick(shareTargetTab);

    // 検証
    expect(addListenerMock).toHaveBeenCalledTimes(1);
    expect(getCurrentMock).toHaveBeenCalledTimes(1);
    expect(createWindowMock).toHaveBeenCalledWith({
      type: 'popup',
      url: 'https://x.com/intent/post?text=Hello%20World%0Ahttps%3A%2F%2Fexample.com%2Ftest%3Fa%3Db%23123',
      ...expected,
    });
  });

  it('正常系（入力値が無い場合もポップアップ表示は行う）', async () => {
    // Mock
    getCurrentMock.mockResolvedValue({} satisfies MockWindow);

    // 実行
    await triggerClick({});

    // 検証
    expect(addListenerMock).toHaveBeenCalledTimes(1);
    expect(getCurrentMock).toHaveBeenCalledTimes(1);
    expect(createWindowMock).toHaveBeenCalledWith({
      type: 'popup',
      url: 'https://x.com/intent/post?text=%0A',
      width: 560, height: 420, left: 120, top: 90,
    });
  });
});
