import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// The base option is set to a relative path to support deployment to GitHub Pages. You can override
// this at build time by defining VITE_BASE in your environment.
// const base = process.env.VITE_BASE || '/portfolio-manager-server/';
const base = process.env.VITE_BASE || '/';
const analyzeFlag = (process.env.ANALYZE ?? '').toString().toLowerCase();
const shouldAnalyze = ['1', 'true', 'yes', 'on'].includes(analyzeFlag);

export default defineConfig({
  base,
  plugins: [
    react(),
    shouldAnalyze &&
      visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  server: {
    proxy: {
      // Proxy API requests during development to the backend server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['decimal.js', 'clsx'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'recharts'],
  },
});
