import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// The base option is set to a relative path to support deployment to GitHub Pages. You can override
// this at build time by defining VITE_BASE in your environment.
// const base = process.env.VITE_BASE || '/portfolio-manager-server/';
const base = process.env.VITE_BASE || '/';
const analyzeFlag = (process.env.ANALYZE ?? '').toString().toLowerCase();
const shouldAnalyze = ['1', 'true', 'yes', 'on'].includes(analyzeFlag);
const DEFAULT_APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://www.tooltician.com https://api.tooltician.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appCsp = env.VITE_APP_CSP || process.env.VITE_APP_CSP || DEFAULT_APP_CSP;

  return {
    base,
    plugins: [
      {
        name: 'inject-csp-meta',
        transformIndexHtml(html) {
          // In dev mode Vite serves HTML directly (no Fastify), so we inject
          // the CSP as a <meta> tag.  In production builds Fastify sets the
          // CSP via HTTP header — skip injection to keep the built HTML clean
          // and avoid the VITE_APP_CSP env-var build warning.
          if (mode !== 'development') {
            // If an explicit CSP was provided (e.g. CI with a custom env),
            // still inject it.  Otherwise let the server handle it.
            const explicitCsp = env.VITE_APP_CSP || process.env.VITE_APP_CSP;
            if (!explicitCsp) {
              return html;
            }
          }
          return {
            html,
            tags: [
              {
                tag: 'meta',
                attrs: {
                  'http-equiv': 'Content-Security-Policy',
                  content: appCsp,
                },
                injectTo: 'head',
              },
            ],
          };
        },
      },
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
      sourcemap: mode === 'development',
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('/recharts/')) {
              return 'vendor-charts';
            }
            if (id.includes('/decimal.js/') || id.includes('/clsx/')) {
              return 'vendor-utils';
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'recharts'],
    },
  };
});
