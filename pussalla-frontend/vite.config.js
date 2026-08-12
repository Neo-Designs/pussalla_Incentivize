import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express backend serves the API on http://localhost:4000.
// In dev, proxy /api to it so cookies/CORS stay simple; in production the
// built bundle is served by the backend (or any static host) and requests
// resolve to the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
