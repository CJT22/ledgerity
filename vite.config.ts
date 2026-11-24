import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.LEDGERITY_PORT ?? 5174);
const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8'));

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'client'),
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    // Dev server stays on this PC unless explicitly opened up (`npm run dev:lan`),
    // mirroring the app's "Phone access" setting being off by default.
    host: process.env.LEDGERITY_DEV_LAN === '1' ? true : 'localhost',
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500, // local app: bundle size is not a concern
  },
});
