import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  build: {
    rollupOptions: {
      input: {
        library: "index.html",
        workbench: "workbench.html",
        player: "player.html",
        skinStudio: "skin-studio.html",
      },
    },
  },
});
