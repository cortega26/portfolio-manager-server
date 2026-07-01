# Plan 017: Enable the Chromium sandbox on the Electron main window

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2de7edc..HEAD -- electron/main.cjs electron/preload.cjs`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2de7edc`, 2026-07-01

## Why this matters

The main application window is created with `sandbox: false`
(`electron/main.cjs:88`). With the sandbox off, a compromised renderer (e.g. via
a supply-chain issue in a bundled frontend dependency) has a materially larger
attack surface — `contextIsolation: true` and `nodeIntegration: false` are set,
but the OS-level Chromium sandbox is the strongest of the three barriers and it
is the one currently disabled. The splash window already runs with
`sandbox: true` (`main.cjs:108+`), so the posture is inconsistent. The preload
uses only sandbox-compatible APIs (see below), so enabling the sandbox is a
cheap defense-in-depth hardening for a local desktop app.

**This is a runtime-config change** — its correctness can only be confirmed by
actually launching Electron and verifying the renderer still boots, reads its
runtime config, and authenticates. Treat the runtime check as mandatory.

## Current state

- `electron/main.cjs:76-99` — the real app window:

  ```js
  function createWindow({ rendererUrl }) {
    const browserWindow = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 1080,
      minHeight: 720,
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // ← the line this plan changes
        additionalArguments:
          typeof process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG === 'string' &&
          process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG.trim().length > 0
            ? [process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG]
            : [],
        preload: path.resolve(__dirname, './preload.cjs'),
      },
    });
    void browserWindow.loadURL(rendererUrl);
    return browserWindow;
  }
  ```

- **Why the preload is expected to survive sandboxing** (`electron/preload.cjs`):
  - It `require('electron')` for only `contextBridge` and `ipcRenderer` — both
    are available in sandboxed preloads.
  - It reads the runtime config from `process.argv` (via the
    `--portfolio-desktop-runtime-config=` entry that `additionalArguments`
    injects) and falls back to `process.env`. `additionalArguments` is the
    documented mechanism for passing data into a **sandboxed** preload, so the
    `process.argv` path is expected to keep working.
  - It does **not** use `fs`, `path`, or any other Node built-in that the
    sandbox would block.

- The runtime config (including the API session token) is set into
  `process.env.PORTFOLIO_DESKTOP_RUNTIME_CONFIG_ARG` **before** the window is
  created (`main.cjs:463`), and the window is created at `main.cjs:470`.

## Commands you will need

| Purpose             | Command                  | Expected on success                                    |
| ------------------- | ------------------------ | ------------------------------------------------------ |
| Lint                | `npm run lint`           | exit 0                                                 |
| Electron smoke test | `npm run electron:smoke` | build succeeds; Electron launches & exits 0 under xvfb |
| Manual full launch  | `npm run electron:dev`   | app window opens; portfolio list loads (auth works)    |

## Scope

**In scope** (the only file you should modify):

- `electron/main.cjs` — the single `sandbox: false` → `sandbox: true` change on
  the **real app window** in `createWindow` (line 88).

**Out of scope** (do NOT touch):

- `electron/preload.cjs` — it is already sandbox-compatible; changing it is not
  part of this plan.
- The splash window config (already `sandbox: true`).
- Moving the session token out of `additionalArguments` (the security audit
  noted the token is visible in `process.argv`). That is a **separate, larger**
  hardening task — see Maintenance notes. Do not attempt it here.

## Git workflow

- Branch: `advisor/017-electron-sandbox-hardening`
- Commit style: conventional commits (e.g.
  `security: enable Chromium sandbox on the Electron main window`).

## Steps

### Step 1: Flip the sandbox flag

In `electron/main.cjs`, inside `createWindow`'s `webPreferences`, change:

```js
        sandbox: false,
```

to:

```js
        sandbox: true,
```

Leave every other option (`contextIsolation`, `nodeIntegration`,
`additionalArguments`, `preload`) unchanged.

**Verify**: `npm run lint` → exit 0.

### Step 2: Runtime verification (MANDATORY — do not skip)

The whole risk of this change is that the sandboxed renderer might fail to read
its runtime config and therefore fail to authenticate to the local API. You
must confirm at runtime.

Preferred (headless CI-style): `npm run electron:smoke` → the build completes
and Electron launches and exits `0` under `xvfb-run`.

If `xvfb-run` / a display is unavailable in your environment, run
`npm run electron:dev` on a machine with a display and confirm:

- the app window opens (not blank),
- the portfolio list / unlock screen loads (this proves the preload read the
  runtime config and the renderer reached the authenticated API).

If **neither** can run in your environment, do NOT mark this plan DONE. Make the
one-line change, pass lint, and then STOP and report that runtime verification
is required by a human/CI (see STOP conditions).

## Test plan

- There is no unit test for Electron window creation; verification is the
  Electron launch itself (Step 2).
- Regression signal: portfolios still list and unlock after launch. A blank
  window or an auth failure (portfolios never load) means the sandbox broke the
  runtime-config handoff.

## Done criteria

ALL must hold:

- [ ] `electron/main.cjs` `createWindow` has `sandbox: true`
- [ ] `grep -n "sandbox:" electron/main.cjs` shows the main window is `true` (and the splash window remains `true`)
- [ ] `npm run lint` exits 0
- [ ] **Runtime verified**: `npm run electron:smoke` exits 0, OR a manual
      `npm run electron:dev` launch confirmed the app boots and loads portfolios
- [ ] `git status` shows only `electron/main.cjs` changed
- [ ] `plans/README.md` status row for 017 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `main.cjs` / `preload.cjs` no longer match the "Current state" excerpts (drift).
- After enabling the sandbox, the renderer boots blank or `window.__APP_CONFIG__`
  is empty / portfolios never load — this means the sandboxed preload could not
  read the runtime config. Revert the change and report; the fix likely requires
  reworking how the runtime config reaches the preload (a larger task), which is
  out of scope here.
- Your environment cannot launch Electron at all (no display, no `xvfb`) — make
  the change, pass lint, and report that runtime verification must be done by a
  human/CI before this is considered DONE.

## Maintenance notes

- **Deferred follow-up (separate plan)**: the API session token is currently
  passed via `additionalArguments`, which makes it visible in the renderer's
  `process.argv`. Moving it to an IPC-only handshake (renderer requests the
  token over a validated IPC channel after load) would remove that exposure.
  That is a larger change with its own runtime-verification burden.
- A reviewer should specifically test portfolio unlock (PIN flow) after this
  lands, since that path exercises the preload's IPC channels under the sandbox.
- If a future feature needs a Node built-in in the preload, it must go through
  the main process over IPC — do not re-disable the sandbox to get it.
