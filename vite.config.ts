import path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import {
  defineConfig,
  InlineConfig,
  transformWithEsbuild,
  type Plugin,
  type UserConfig,
} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

interface VitestConfigExport extends UserConfig {
  test: InlineConfig;
}

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const deployableSources: Record<string, string> = {
  "logicflow:source/built-in": path.resolve(
    projectRoot,
    "src/lib/operations/runtime.ts"
  ),
  "logicflow:source/virtual/ffmpeg": path.resolve(
    projectRoot,
    "src/lib/packages/virtual/ffmpeg.ts"
  ),
};
function deployableSourceStrings(): Plugin {
  const prefix = "\0";
  return {
    name: "logicflow-deployable-source-strings",
    resolveId: (id) => (id in deployableSources ? `${prefix}${id}` : undefined),
    async load(id) {
      if (!id.startsWith(prefix)) return;
      const filePath = deployableSources[id.slice(prefix.length)];
      if (!filePath) return;
      const { code } = await transformWithEsbuild(
        await readFile(filePath, "utf8"),
        filePath,
        { format: "esm", loader: "ts", target: "esnext" }
      );
      return `export default ${JSON.stringify(code)};`;
    },
  };
}

export default defineConfig({
  plugins: [deployableSourceStrings(), react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    coverage: { provider: "v8", include: ["src/lib/**/*.ts"] },
  },
  server: {
    port: 3000,
    open: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/api/vercel": {
        target: "https://api.vercel.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vercel/, ""),
      },
      "/api/supabase": {
        target: "https://api.supabase.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supabase/, ""),
      },
    },
  },
  worker: { format: "es" },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "./src"),
    },
  },
  assetsInclude: ["**/*.md"],
} as VitestConfigExport);
