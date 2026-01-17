import type { StackMappingResult } from './stacktrace-mapper.js';

type StackMapper = (text: string) => StackMappingResult;

export const createCapturedErrorPusher = <
  T extends {
    message: string;
    stack?: string;
    mappedMessage?: string;
    mappedStack?: string;
  },
>(
  target: T[],
  mapStackText: StackMapper,
): ((err: Omit<T, 'mappedMessage' | 'mappedStack'>) => void) => {
  return (err: Omit<T, 'mappedMessage' | 'mappedStack'>): void => {
    const mappedMessage: string = mapStackText(err.message).mapped;
    const mappedStack: string | undefined = err.stack
      ? mapStackText(err.stack).mapped
      : undefined;

    target.push({
      ...(err as T),
      mappedMessage,
      ...(mappedStack ? { mappedStack } : null),
    });
  };
};

