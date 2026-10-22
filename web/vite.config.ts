import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5317,
    // در حالت توسعه، درخواست‌های API و WebSocket به سرور Node می‌روند
    proxy: {
      '/api': 'http://127.0.0.1:4317',
      '/ws': { target: 'ws://127.0.0.1:4317', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
