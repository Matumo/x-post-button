import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import * as path from "node:path";

export type TestWebServer = {
  url: string;
  close: () => Promise<void>;
};

type TestWebAsset = {
  filePath: string;
  contentType: string;
};

function createTestWebAssetMap(rootDir: string): Map<string, TestWebAsset> {
  const assetMap = new Map<string, TestWebAsset>();
  const absoluteRoot = path.resolve(rootDir);
  const htmlAsset: TestWebAsset = {
    filePath: path.join(absoluteRoot, "src/test/util/web-server/test.html"),
    contentType: "text/html; charset=utf-8"
  };

  const register = (routes: string[], asset: TestWebAsset) => {
    routes.forEach((route) => assetMap.set(route, asset));
  };

  register(["/test.html"], htmlAsset);

  return assetMap;
}

export async function startTestWebServer(rootDir: string): Promise<TestWebServer> {
  const TestWebAssets = createTestWebAssetMap(rootDir);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const asset = TestWebAssets.get(url.pathname);

    if (!asset) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    try {
      const body = await fs.readFile(asset.filePath);
      res.statusCode = 200;
      res.setHeader("Content-Type", asset.contentType);
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind TestWeb server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
