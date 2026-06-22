import { promises as fsPromises } from 'node:fs';
import { PNG } from 'pngjs';

export type ScreenshotStats = {
  width: number;
  height: number;
  pixelCount: number;
  redPixelCount: number;
};

export type RectangleBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
};

type SearchArea = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const createEmptyRectangleBounds = (): RectangleBounds => ({
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
  pixelCount: 0,
});

const expandRectangleBounds = (
  bounds: RectangleBounds,
  x: number,
  y: number,
): void => {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
  bounds.pixelCount += 1;
};

const isRectangleBoundsValid = (bounds: RectangleBounds): boolean =>
  Number.isFinite(bounds.minX) &&
  Number.isFinite(bounds.minY) &&
  Number.isFinite(bounds.maxX) &&
  Number.isFinite(bounds.maxY) &&
  bounds.pixelCount > 0;

export const rectangleWidth = (bounds: RectangleBounds): number =>
  isRectangleBoundsValid(bounds)
    ? bounds.maxX - bounds.minX + 1
    : 0;

export const rectangleHeight = (bounds: RectangleBounds): number =>
  isRectangleBoundsValid(bounds)
    ? bounds.maxY - bounds.minY + 1
    : 0;

const isRedPixel = (r: number, g: number, b: number, a: number): boolean =>
  r === 255 && g === 0 && b === 0 && a === 255;

export const calculateScreenshotStats = async (
  filePath: string,
): Promise<ScreenshotStats> => {
  const fileBuffer = await fsPromises.readFile(filePath);
  const png = PNG.sync.read(fileBuffer);
  let pixelCount = 0;
  let redPixelCount = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    pixelCount += 1;
    if (isRedPixel(r, g, b, a)) {
      redPixelCount += 1;
    }
  }
  return {
    width: png.width,
    height: png.height,
    pixelCount,
    redPixelCount,
  };
};

const loadPng = async (filePath: string) => {
  const fileBuffer = await fsPromises.readFile(filePath);
  return PNG.sync.read(fileBuffer);
};

const findRedRectangleBounds = (
  data: Uint8Array,
  width: number,
  height: number,
): RectangleBounds => {
  const redBounds = createEmptyRectangleBounds();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (isRedPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        expandRectangleBounds(redBounds, x, y);
      }
    }
  }
  return redBounds;
};

const assertValidRedBounds = (redBounds: RectangleBounds): void => {
  if (!isRectangleBoundsValid(redBounds)) {
    throw new Error('赤色の領域を検出できませんでした');
  }
  if (redBounds.maxX - redBounds.minX < 2 || redBounds.maxY - redBounds.minY < 2) {
    throw new Error('赤色の領域が小さすぎて内側の判定ができません');
  }
};

const createInnerSearchArea = (redBounds: RectangleBounds): SearchArea => ({
  minX: redBounds.minX + 1,
  maxX: redBounds.maxX - 1,
  minY: redBounds.minY + 1,
  maxY: redBounds.maxY - 1,
});

const floodFillNonRedRegion = (
  startIndex: number,
  data: Uint8Array,
  width: number,
  searchArea: SearchArea,
  visited: Uint8Array,
): RectangleBounds => {
  const bounds = createEmptyRectangleBounds();
  const queue: number[] = [startIndex];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    const cy = Math.floor(current / width);
    const cx = current - cy * width;
    expandRectangleBounds(bounds, cx, cy);

    const neighbors: [number, number][] = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < searchArea.minX || nx > searchArea.maxX || ny < searchArea.minY || ny > searchArea.maxY) {
        continue;
      }
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) {
        continue;
      }
      const neighborOffset = neighborIndex * 4;
      if (isRedPixel(
        data[neighborOffset],
        data[neighborOffset + 1],
        data[neighborOffset + 2],
        data[neighborOffset + 3],
      )) {
        continue;
      }
      visited[neighborIndex] = 1;
      queue.push(neighborIndex);
    }
  }

  return bounds;
};

const collectInnerCandidates = (
  data: Uint8Array,
  width: number,
  height: number,
  searchArea: SearchArea,
): RectangleBounds[] => {
  const visited: Uint8Array = new Uint8Array(width * height);
  const candidates: RectangleBounds[] = [];

  for (let y = searchArea.minY; y <= searchArea.maxY; y += 1) {
    for (let x = searchArea.minX; x <= searchArea.maxX; x += 1) {
      const pointIndex = y * width + x;
      if (visited[pointIndex]) {
        continue;
      }
      const offset = pointIndex * 4;
      if (isRedPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        continue;
      }
      visited[pointIndex] = 1;
      const bounds = floodFillNonRedRegion(pointIndex, data, width, searchArea, visited);
      if (isRectangleBoundsValid(bounds)) {
        candidates.push(bounds);
      }
    }
  }

  return candidates;
};

const selectLargestCandidate = (candidates: RectangleBounds[]): RectangleBounds => {
  if (candidates.length === 0) {
    throw new Error('赤色領域内に赤以外の領域を検出できませんでした');
  }
  candidates.sort((a, b) => b.pixelCount - a.pixelCount);
  return candidates[0];
};

export const detectNestedRectangles = async (
  filePath: string,
): Promise<{ redBounds: RectangleBounds; innerBounds: RectangleBounds }> => {
  const { width, height, data } = await loadPng(filePath);
  const redBounds = findRedRectangleBounds(data, width, height);
  assertValidRedBounds(redBounds);
  const searchArea = createInnerSearchArea(redBounds);
  const candidates = collectInnerCandidates(data, width, height, searchArea);
  const innerBounds = selectLargestCandidate(candidates);
  return { redBounds, innerBounds };
};
