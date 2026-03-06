import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // proxy backend APIs during development (local or inside Docker)
    proxy: (() => {
      // use VITE_API_BASE from environment if provided, otherwise default localhost
      const target = process.env.VITE_API_BASE || 'http://localhost:4000';
      return {
        '/auth': { target, changeOrigin: true },
        '/user_roles': { target, changeOrigin: true },
        '/theses': { target, changeOrigin: true },
        '/settings': { target, changeOrigin: true },
        '/profiles': { target, changeOrigin: true },
        '/programs': { target, changeOrigin: true },
        '/users': { target, changeOrigin: true },
        '/super': { target, changeOrigin: true },
        // proxy admin API routes only (skip bare '/admin' so SPA can handle it)
      '^/admin/.*': { target, changeOrigin: true },
        // any other backend routes should be proxied as needed
      };
    })(),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
