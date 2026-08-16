import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "@nozbe/watermelondb",
      "@nozbe/watermelondb/adapters/lokijs",
      "@nozbe/watermelondb/react",
    ],
  },
  define: {
    global: "globalThis",
  },
  server: {
    host: true,
    port: 3000,
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
  },
})
