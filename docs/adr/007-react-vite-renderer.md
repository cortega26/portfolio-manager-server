# ADR-007: React + Vite as the renderer stack

- **Status**: Accepted
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

The frontend needs fast iteration (HMR), a component model suitable for
data-heavy tables and charts, and a build output that Electron can load as a
static bundle. The team has existing React expertise. The renderer has no
access to Node APIs (enforced by Electron's `contextIsolation`) so a
Node-first framework like Next.js or Remix would add complexity without benefit.

## Decision

The renderer is a standard React 18 SPA built and served by Vite. In
development (`electron:dev`), Vite HMR serves from `localhost:5173`. In
production, `npm run build` produces a `dist/` bundle that Electron loads as
a local file. All routing is client-side via `react-router-dom`. There is no
SSR — the Express backend is an API, not a page renderer.

## Alternatives considered

| Option                      | Why rejected                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Next.js / Remix             | SSR not needed; adds Node server inside Electron; complicates the build pipeline           |
| Vue / Svelte                | Team expertise is React; migration cost with no functional gain                            |
| Webpack (CRA)               | Slower builds; CRA is unmaintained; Vite is the current standard                           |
| Vanilla JS / Web Components | More manual wiring for charts, tables, and reactive state; no existing component libraries |

## Consequences

- **Good**: fast HMR in dev; standard React ecosystem (Recharts, react-window,
  react-router-dom); small, auditable build output.
- **Bad**: SPA routing requires the `spa-404.js` fallback in `public/`; bundle
  size grows if third-party chart libraries are added carelessly.
- **Neutral**: TypeScript is used for type-checking (`tsconfig.typecheck.json`)
  but the source files are `.jsx`/`.js` — strict TS compilation is not enforced
  at build time, only via `npm run verify:typecheck`.
