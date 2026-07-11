import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client is served by Vite on :5173; API and image requests are proxied
// to the Express server on :3001 so everything is same-origin in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/images": "http://localhost:3001",
    },
  },
});
