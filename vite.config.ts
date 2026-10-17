import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  build: {
    rollupOptions: {
      input: {
        editor: "index.html",
        player: "player.html",
        rigLab: "rig-lab.html",
      },
    },
  },
});
