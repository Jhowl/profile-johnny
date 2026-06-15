import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // During `npm run dev`, forward /api to the local backend so the
    // frontend and API are same-origin (no CORS). Start the backend with:
    //   cd server && npm run dev
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
