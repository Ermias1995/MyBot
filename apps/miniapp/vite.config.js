import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    // Cloudflare quick tunnels use a new *.trycloudflare.com host each run.
    allowedHosts: ['.trycloudflare.com', 'localhost'],
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
