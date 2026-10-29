import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In development the API runs on :4000. Proxying keeps everything on one origin, so the
// httpOnly refresh cookie works without any CORS setup.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
