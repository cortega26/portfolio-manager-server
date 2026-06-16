# Plan 010: Electron app packaging for Linux distribution

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 21ff5b1..HEAD -- electron/ package.json scripts/run-electron.mjs`
> If these files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `21ff5b1`, 2026-06-16

## Why this matters

The app currently can only run from source — users must clone the repository, install Node.js, and run `npm ci` to use it. This is the single biggest blocker to real user adoption. The backlog explicitly lists Phase 8 (packaging) as `PENDIENTE`. Adding `electron-builder` to produce an AppImage (Linux) enables one-command distribution. This plan scopes to Linux only (the development platform) but the config generalizes to macOS/Windows.

## Current state

- `electron/package.json` — minimal, no build config:

  ```json
  {
    "name": "portfolio-manager-unified-electron-shell",
    "private": true,
    "main": "main.cjs",
    "type": "module"
  }
  ```

- `package.json:21` — the current "build" script just launches Electron, doesn't package:

  ```json
  "electron:build": "npm run build && npm run electron",
  ```

- `scripts/run-electron.mjs` — launches Electron with the built Vite output. It spawns `electron .` with the project root as the working directory.

- No `electron-builder` or `@electron/packager` in `devDependencies`.

- `electron/main.cjs:86-87` — BrowserWindow config with `contextIsolation: true` (correct for production).

- `vite.config.js` — `base` is set to `'/'` (not relative). This is correct for an Electron app loading from `file://` or a local server.

## Commands you will need

| Purpose    | Command                        | Expected on success                  |
| ---------- | ------------------------------ | ------------------------------------ |
| Install    | `npm ci --no-fund --no-audit`  | exit 0                               |
| Build Vite | `npm run build`                | exit 0                               |
| Lint       | `npm run lint`                 | exit 0                               |
| Test       | `npm test`                     | all pass                             |
| Package    | `npx electron-builder --linux` | exit 0, produces AppImage in `dist/` |

## Scope

**In scope**:

- `package.json` — add `electron-builder` devDependency, add `dist:linux` and `pack` scripts, add `build` config section
- `electron/package.json` — may need updating for electron-builder metadata
- Create `electron-builder.yml` — config for Linux AppImage build
- `.gitignore` — ensure `dist/` is already ignored (it should be)

**Out of scope**:

- macOS (`.dmg`) or Windows (`.exe`) builds — the config can be extended later
- Code signing — not needed for personal/local distribution
- Auto-update — electron-updater is a separate feature
- GitHub Actions release workflow — this plan covers local packaging only; CI is a follow-up
- Icon design — use a placeholder or the existing `public/` assets

## Git workflow

- Branch: `advisor/010-electron-packaging`
- Commit style: `feat: add electron-builder configuration for Linux AppImage packaging`

## Steps

### Step 1: Add electron-builder as a dev dependency

```bash
npm install --save-dev electron-builder
```

**Verify**: `grep "electron-builder" package.json` → matches in `devDependencies`.

### Step 2: Create electron-builder configuration

Create `electron-builder.yml` at the project root:

```yaml
appId: com.portfolio-manager-unified.app
productName: Portfolio Manager
copyright: Copyright © 2026

directories:
  output: release
  buildResources: build

files:
  - dist/**/*
  - electron/**/*
  - server/**/*
  - shared/**/*
  - node_modules/**/*
  - package.json
  - package-lock.json
  - .env.example

# Don't include dev files
asar: true

linux:
  target:
    - AppImage
  category: Finance
  synopsis: Desktop Portfolio Manager
  description: Local-first desktop portfolio tracker with SQLite storage, price tracking, benchmarks, and signal notifications.
  maintainer: Carlos Ortega

# AppImage specific
appImage:
  systemIntegration: doNotAsk
```

Key decisions:

- `asar: true` — bundles the app into a single archive for distribution
- `files` — includes only what's needed at runtime: the built Vite output (`dist/`), Electron shell (`electron/`), backend (`server/`), shared modules (`shared/`), and production `node_modules`
- `directories.output: release` — packages go to `release/`, separate from `dist/` (Vite output)

**Verify**: `ls electron-builder.yml` → file exists.

### Step 3: Add npm scripts for packaging

In `package.json`, add these scripts:

```json
"dist:linux": "npm run build && electron-builder --linux",
"dist:dir": "npm run build && electron-builder --linux --dir",
"pack": "npm run build && electron-builder --linux --publish never"
```

- `dist:linux` — full production build + AppImage
- `dist:dir` — unpacked directory (faster, for testing)
- `pack` — build without publishing

**Verify**: `npm run dist:dir` → creates `release/linux-unpacked/` directory with the app.

### Step 4: Update electron/main.cjs for production paths

In a packaged Electron app, `__dirname` points inside the ASAR archive. Ensure file paths are resolved correctly. Check `electron/main.cjs` for any hardcoded paths:

```bash
grep -n "__dirname\|path.join\|path.resolve" electron/main.cjs
```

If the server entrypoint (`server/index.js`) or any data directory is referenced via `__dirname`, update to use `app.getAppPath()` or `process.resourcesPath` for packaged builds. The `dist/` directory should be referenced relative to the app root:

```js
const appPath = app.getAppPath();
const serverEntry = path.join(appPath, 'server', 'index.js');
```

**Verify**: `grep -n "app.getAppPath\|process.resourcesPath" electron/main.cjs` → should show correct path resolution.

### Step 5: Test the packaged app

```bash
npm run dist:dir
```

Then launch the unpacked app:

```bash
./release/linux-unpacked/portfolio-manager-unified
```

Verify:

- The app window opens
- The API server starts on loopback
- The frontend loads and connects to the API
- Tabs are navigable

**Smoke test**: `npm run electron:smoke` → should still work (smoke test uses the dev path, not the packaged path).

### Step 6: Add release/ to .gitignore

**Verify**: `grep "release" .gitignore` → should have `release/` listed. If not, add it.

## Test plan

- Existing tests must continue to pass: `npm test` → all pass.
- Manual smoke test: launch the packaged app and verify the dashboard loads, prices fetch, and tabs are navigable.
- For CI: add a step that runs `npm run dist:dir` and verifies the output directory exists with the expected files.

## Done criteria

- [ ] `npm run dist:dir` exits 0 and produces `release/linux-unpacked/`
- [ ] `npm run dist:linux` exits 0 and produces `release/*.AppImage`
- [ ] The packaged app launches and the frontend connects to the API
- [ ] `npm test` exits 0; all tests pass
- [ ] `npm run lint` exits 0
- [ ] `grep "release" .gitignore` shows `release/` is ignored
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `electron-builder` fails with a path resolution error — the `files` glob in electron-builder.yml may need adjustment for the project's specific directory structure.
- The packaged app crashes on launch — check the console output for missing modules or path errors. Use `dist:dir` (unpacked) for easier debugging.
- The server fails to start in the packaged app — the `node_modules` included in the package may be missing native modules (`sql.js` uses WebAssembly, not native bindings, so this should work).
- The frontend shows a blank screen — check that `dist/index.html` is included and the `base` path in `vite.config.js` is correct for `file://` protocol loading.

## Maintenance notes

- The `files` glob in electron-builder.yml must be updated when new top-level directories are added (e.g., if a `config/` or `resources/` directory is created).
- macOS and Windows builds can be added by extending the `mac` and `win` sections of electron-builder.yml. macOS requires code signing for distribution; Windows requires NSIS configuration.
- The `release/` directory can be large (200-400 MB for unpacked Linux). It should be in `.gitignore` and cleaned with `npm run clean` if a clean script is added.
- If the app grows beyond 500 MB unpacked, consider splitting `node_modules` in the `files` config to exclude dev dependencies (electron-builder should do this automatically via `dependencies` vs `devDependencies` in package.json).
