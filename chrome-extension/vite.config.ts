import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export default defineConfig({
  root: resolve(projectRoot, "chrome-extension"),
  publicDir: "public", // root 配下の public を使用
  resolve: {
    alias: {
      "@main": resolve(projectRoot, "chrome-extension/src/main"),
      "@test": resolve(projectRoot, "chrome-extension/src/test"),
    },
  },
  build: {
    outDir: resolve(projectRoot, "dist/chrome-extension"), // ルート基準にしないため絶対パスで指定
    emptyOutDir: true,
    minify: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(projectRoot, "chrome-extension/src/main/background.ts"),
      },
      output: {
        entryFileNames: "src/main/[name].js"
      }
    }
  }
});
