import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createStackString, parseStacktrace } from '@vitest/utils/source-map';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

export type StackMappingResult = {
  mapped: string;
  mappedStack: string;
};

const getChromeExtensionJsPath = (file: string): string | undefined => {
  const directUrlMatch: RegExpMatchArray | null = file.match(
    /^chrome-extension:\/\/[a-p]{32}(\/.*\.js)$/,
  );
  if (directUrlMatch) return directUrlMatch[1];

  const normalizedIdx: number = file.indexOf('chrome-extension:/');
  if (normalizedIdx === -1) return undefined;
  const rest: string = file.slice(normalizedIdx + 'chrome-extension:/'.length);
  const normalizedMatch: RegExpMatchArray | null = rest.match(
    /^[a-p]{32}(\/.*\.js)$/,
  );
  return normalizedMatch ? normalizedMatch[1] : undefined;
};

export const createChromeExtensionStackMapper = (
  extensionDist: string,
): ((text: string) => StackMappingResult) => {
  const sourceMapCache: Map<string, TraceMap> = new Map();

  return (text: string): StackMappingResult => {
    const stacks = parseStacktrace(text);
    const mappedStacks = stacks.map((stack) => {
      const jsPath: string | undefined = getChromeExtensionJsPath(stack.file);
      if (!jsPath) return stack;

      const jsAbsPath: string = resolve(extensionDist, `.${jsPath}`);
      const mapPath: string = `${jsAbsPath}.map`;
      if (!existsSync(mapPath)) return stack;

      let traceMap: TraceMap | undefined = sourceMapCache.get(mapPath);
      if (!traceMap) {
        const raw: string = readFileSync(mapPath, { encoding: 'utf8' });
        traceMap = new TraceMap(JSON.parse(raw));
        sourceMapCache.set(mapPath, traceMap);
      }

      const pos = originalPositionFor(traceMap, {
        line: stack.line,
        column: Math.max(0, stack.column - 1),
      });
      if (!pos.source || !pos.line || pos.column == null) return stack;

      return {
        ...stack,
        file: resolve(dirname(jsAbsPath), pos.source),
        line: pos.line,
        column: pos.column + 1,
        method: pos.name ?? stack.method,
      };
    });

    const mappedStack: string = createStackString(mappedStacks);
    if (!mappedStack) return { mapped: text, mappedStack: '' };

    const headerIndex: number = text.indexOf('\n    at ');
    const header: string = headerIndex === -1 ? '' : text.slice(0, headerIndex);
    return { mapped: header ? `${header}\n${mappedStack}` : mappedStack, mappedStack };
  };
};
