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
  test: { globals: true, environment: "jsdom" },
  server: { port: 3000, open: true },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
  assetsInclude: ["**/*.md"],
} as VitestConfigExport);
