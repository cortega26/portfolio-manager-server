import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The base option is set to a relative path to support deployment to GitHub Pages. You can override
// this at build time by defining VITE_BASE in your environment.
const base = process.env.VITE_BASE || '/portfolio-manager-server/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests during development to the backend server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
