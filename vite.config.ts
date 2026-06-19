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
import { VitePWA } from "vite-plugin-pwa";

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

const devProxyPath = "/api/proxy";

function getProxyTarget(proxyPath = ""): URL {
  const target = new URL(proxyPath, "http://localhost").searchParams.get("url");
  const url = new URL(target || "");
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http(s) URLs can be proxied");
  }
  return url;
}

function devExternalApiProxy(): Plugin {
  return {
    name: "logicflow-dev-external-api-proxy",
    configureServer(server) {
      server.middlewares.use(devProxyPath, async (req, res) => {
        let target: URL;
        try {
          target = getProxyTarget(req.url);
        } catch (error) {
          res.statusCode = 400;
          res.end(error instanceof Error ? error.message : "Invalid proxy URL");
          return;
        }

        try {
          const response = await fetch(target, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body:
              req.method === "GET" || req.method === "HEAD" ? undefined : req,
            // Required by Node when streaming a request body through fetch.
            duplex: "half",
          } as RequestInit);

          res.statusCode = response.status;
          const decodedResHeaders = ["content-encoding", "content-length"];
          response.headers.forEach((value, key) => {
            if (!decodedResHeaders.includes(key)) res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.end(
            error instanceof Error ? error.message : "Proxy request failed"
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    deployableSourceStrings(),
    devExternalApiProxy(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.{png,svg}"],
      manifest: {
        name: "Logicflow - Programming through chained operations",
        short_name: "Logicflow",
        description:
          "Logicflow is a live, block-based visual programming environment built around data transformation through chained operations.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#1e1e1e",
        theme_color: "#1e1e1e",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/maskable-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,gif,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/docs-images/"),
            handler: "CacheFirst",
            options: {
              cacheName: "logicflow-docs-images",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
            options: { cacheName: "logicflow-api" },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    coverage: { provider: "v8", include: ["src/lib/**/*.ts"] },
  },
  server: {
    port: 3000,
    open: true,
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
