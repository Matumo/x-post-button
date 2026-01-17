import { createBrowserTestErrorCapture } from './browser-test-error-capture.js';
export { type CapturedError } from './browser-test-error-capture.js';

export const createBrowserTestObserver = (extensionDist: string) => {
  const capture = createBrowserTestErrorCapture(extensionDist);

  const attachUnhandledRejection = capture.attachUnhandledRejection;
  const attachPage = capture.attachPage;
  const attachServiceWorker = capture.attachServiceWorker;
  const assertNoCapturedErrors = capture.assertNoCapturedErrors;
  const pushTestError = capture.pushTestError;
  const recordConsole = capture.recordConsole;

  return {
    attachUnhandledRejection,
    attachPage,
    attachServiceWorker,
    assertNoCapturedErrors,
    pushTestError,
    recordConsole,
  };
};
