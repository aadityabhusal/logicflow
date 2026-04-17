import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, InlineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

interface VitestConfigExport extends UserConfig {
  test: InlineConfig;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
  assetsInclude: ["**/*.md"],
} as VitestConfigExport);
