type ErrorPayload<Source extends string> = {
  source: Source;
  kind: 'pageerror' | 'crash' | 'unhandledRejection';
  message: string;
  stack?: string;
};

export const createErrorRecorder = <Source extends string>(
  pushCapturedError: (err: ErrorPayload<Source>) => void,
): ((
  source: Source,
) => {
  recordPageError: (err: Error) => void;
  recordCrash: () => void;
  recordUnhandledRejection: (reason: unknown) => void;
}) => {
  return (source: Source) => {
    const recordPageError = (err: Error): void => {
      pushCapturedError({
        source,
        kind: 'pageerror',
        message: err.message,
        stack: err.stack,
      });
    };

    const recordCrash = (): void => {
      pushCapturedError({
        source,
        kind: 'crash',
        message: 'Page crashed',
      });
    };

    const recordUnhandledRejection = (reason: unknown): void => {
      const message: string =
        reason instanceof Error ? reason.message : String(reason);
      const stack: string | undefined =
        reason instanceof Error ? reason.stack : undefined;
      pushCapturedError({
        source,
        kind: 'unhandledRejection',
        message,
        stack,
      });
    };

    return {
      recordPageError,
      recordCrash,
      recordUnhandledRejection,
    };
  };
};
