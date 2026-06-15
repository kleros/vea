import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["@kleros/veashi-sdk"],
  },
  build: {
    commonjsOptions: {
      include: [/veashi-sdk/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
});
