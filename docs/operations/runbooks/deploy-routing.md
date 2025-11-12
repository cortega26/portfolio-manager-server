# Deployment Routing Playbook

This document captures the routing configuration required to keep the Tooltician single-page application accessible on GitHub Pages when users land directly on deep links such as `/admin`.

## Host configuration

| Setting | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| SPA fallback | Static file (`public/404.html`) | N/A | Yes | Redirects all unknown paths to `/index.html` after saving the requested location in `sessionStorage`. |
| Health check | GitHub Actions step | N/A | Yes | Executes `curl -f` against `/` and `/admin` to detect regressions before merge. |

### Why GitHub Pages needs a fallback

GitHub Pages serves static files as-is and responds with a `404` when a path does not match a file on disk. Because the React application relies on client-side routing (React Router `BrowserRouter`), any deep link first requires `index.html` so the JavaScript bundle can take over. Without a custom `404.html`, GitHub Pages returns its default 404 screen, leaving `/admin` unusable on hard refreshes.

### Implementation details

1. **`public/404.html`** now ships with the build output. It captures the original `pathname + search + hash`, stores it in `sessionStorage`, and then redirects visitors to `/index.html`. Once the SPA hydrates, `public/redirect-spa.js` restores the saved URL so the intended route renders.
2. The file lives under `public/` so Vite copies it verbatim into `dist/404.html`. Deploying the `dist/` directory to GitHub Pages ensures the fallback is present in production.
3. **CI health checks** (`.github/workflows/ci.yml`) run `curl -f` against both the homepage and `/admin`. Any regression (missing fallback, DNS outage) fails the workflow early.

### Verification checklist

- `npm run build` produces `dist/404.html` alongside `index.html`.
- Visiting `https://www.tooltician.com/admin` responds with HTTP 200 and renders the Admin panel even after a hard refresh.
- GitHub Actions `CI` workflow passes the routing health check.

## Troubleshooting

- **Still receiving 404s?** Confirm the deployment process publishes the contents of `dist/` and that `dist/404.html` exists.
- **Redirect loop?** Clear `sessionStorage` and ensure the deployed `redirect-spa.js` matches the repository version.
- **Different host?** For non-GitHub Pages environments (Netlify, Vercel, Cloudflare Pages), replace the fallback with provider-specific rewrite rules instead of relying on `404.html`.
