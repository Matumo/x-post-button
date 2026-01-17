import type { ConsoleMessage } from '@playwright/test';

const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }

  try {
    const json = JSON.stringify(value);
    return json ?? String(value);
  } catch {
    return String(value);
  }
};

export const formatConsoleMessage = async (
  msg: ConsoleMessage,
): Promise<string> => {
  const args = msg.args();
  if (args.length === 0) {
    return msg.text();
  }

  const serializedArgs: string[] = await Promise.all(
    args.map(async (arg) => {
      try {
        const value: unknown = await arg.jsonValue();
        return stringifyValue(value);
      } catch (error) {
        const description = arg.toString();
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `[unserializable:${description}:${errorMessage}]`;
      }
    }),
  );

  return serializedArgs.join(' ');
};
