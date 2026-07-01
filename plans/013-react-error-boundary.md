# Plan 013: Add a top-level React error boundary so a render crash shows recovery UI instead of a blank app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2de7edc..HEAD -- src/App.jsx src/components/`
> If `src/App.jsx` changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2de7edc`, 2026-07-01

## Why this matters

This is a desktop-first app: the React renderer is the user's entire interface.
Today there is **no React error boundary anywhere in `src/`** (verified:
`grep -rln "componentDidCatch\|getDerivedStateFromError\|ErrorBoundary" src/`
returns nothing). That means any uncaught exception thrown during render — a
malformed price payload, an unexpected `null`, a bad `.map` — unmounts the
whole React tree and leaves the user staring at a blank window with no way to
recover except quitting and relaunching Electron. A single top-level error
boundary converts that into a readable "something went wrong" screen with a
reload button, and logs the error to the console for diagnosis. It is a small,
additive, low-risk resilience win with a clean verification story.

## Current state

- `src/App.jsx` — the router root. This is the whole file today:

  ```jsx
  import { Navigate, Route, Routes } from 'react-router-dom';

  import PortfolioManagerApp from './PortfolioManagerApp.jsx';

  export default function App() {
    return (
      <Routes>
        <Route path="/" element={<PortfolioManagerApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  ```

- **The codebase is functional-component only** — `grep -rln "extends React.Component\|extends Component" src/` returns nothing. React error boundaries _require_ a class component (there is no hook equivalent for `componentDidCatch`), so this `ErrorBoundary` will be the single, intentional class component. That is expected and correct; do not try to build it as a function component.
- Styling is Tailwind CSS (see `tailwind.config.js`); the app uses a dark slate palette (the Electron window background is `#0f172a`). Match that in the fallback UI.
- **i18n caveat**: the app has an i18n provider (`src/i18n/`), but the boundary must render even if the i18n context itself is what threw. Do **not** call `useI18n()` inside the boundary — hardcode short English strings in the fallback.

## Commands you will need

| Purpose            | Command                                               | Expected on success   |
| ------------------ | ----------------------------------------------------- | --------------------- |
| Single test file   | `npx vitest run src/__tests__/ErrorBoundary.test.jsx` | all pass              |
| Full frontend test | `npx vitest run`                                      | all pass              |
| Lint               | `npm run lint`                                        | exit 0, zero warnings |
| Typecheck          | `npm run verify:typecheck`                            | exit 0, no errors     |

## Suggested executor toolkit

- If available, invoke the `vitest` skill when writing the test in Step 3.
- Model the test after an existing React test that already uses
  `@testing-library/react`, e.g. `src/__tests__/AllocationChart.test.tsx` or
  `src/__tests__/App.test.jsx`. The Vitest environment is jsdom with
  `src/setupTests.ts` as the setup file (see `vitest.config.ts`).

## Scope

**In scope** (the only files you should create/modify):

- `src/components/ErrorBoundary.jsx` (create)
- `src/App.jsx` (wrap the routes)
- `src/__tests__/ErrorBoundary.test.jsx` (create)

**Out of scope** (do NOT touch, even though they look related):

- `src/PortfolioManagerApp.jsx` and individual tab components — per-tab
  granular boundaries are a reasonable follow-up but are **not** part of this
  plan. One top-level boundary is the deliverable.
- Any telemetry/remote error-reporting integration — console logging only.
- The existing toast system (`src/hooks/useToasts.js`) — the boundary is a
  render-crash fallback, a different concern from toasts.

## Git workflow

- Branch: `advisor/013-react-error-boundary`
- Commit style: conventional commits (matches `git log`, e.g.
  `feat: add top-level React error boundary`). Do NOT push or open a PR unless
  the operator instructs it.

## Steps

### Step 1: Create the ErrorBoundary component

Create `src/components/ErrorBoundary.jsx`. It must:

- Be a class extending `React.Component`.
- Implement `static getDerivedStateFromError(error)` to flip an
  `hasError` state flag.
- Implement `componentDidCatch(error, info)` to `console.error(...)` the error
  and component stack (so crashes are diagnosable in the DevTools console).
- Render `this.props.children` when there is no error.
- Render a fallback screen when `hasError` is true: a full-height dark panel
  with a heading ("Something went wrong"), a short sentence telling the user to
  reload, and a button whose `onClick` calls `window.location.reload()`.

Target shape (adapt class names to Tailwind conventions already in the repo):

```jsx
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface the crash to the console for diagnosis; no remote reporting.
    console.error('Unhandled render error', error, info?.componentStack);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-8 text-center text-slate-100"
        >
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-slate-300">
            The app hit an unexpected error. Reloading usually fixes it. If it keeps happening, your
            data is safe — it is stored locally.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Verify**: `npm run verify:typecheck` → exit 0 (checkJs is on, so the `.jsx`
file is typechecked; if `this.props.children` triggers a type error, add a
minimal JSDoc `@typedef` or `/** @type {{ children: React.ReactNode }} */` as
needed — do not switch off checking).

### Step 2: Wrap the router in App.jsx

Import the boundary and wrap the `<Routes>` element with it:

```jsx
import { Navigate, Route, Routes } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary.jsx';
import PortfolioManagerApp from './PortfolioManagerApp.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<PortfolioManagerApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
```

**Verify**: `npm run lint` → exit 0.

### Step 3: Add the test

Create `src/__tests__/ErrorBoundary.test.jsx`. Cover:

1. **Renders children when no error**: render `<ErrorBoundary><div>ok</div></ErrorBoundary>`, assert the child text is visible.
2. **Renders fallback when a child throws**: define a child component that throws during render, render it inside the boundary, assert the fallback (`role="alert"` / "Something went wrong") is visible and the child content is not.

Notes for the throwing-child test:

- React logs caught errors to `console.error`; silence the noise by spying/mocking `console.error` for that test (`vi.spyOn(console, 'error').mockImplementation(() => {})`) and restoring it after.
- Use `@testing-library/react`'s `render` and `screen`, matching the import
  style in `src/__tests__/App.test.jsx`.

**Verify**: `npx vitest run src/__tests__/ErrorBoundary.test.jsx` → 2 tests pass.

## Test plan

- New file `src/__tests__/ErrorBoundary.test.jsx`, two tests: happy path
  (children render) and crash path (fallback renders). Structural pattern:
  `src/__tests__/AllocationChart.test.tsx` (imports, `render`, `screen`).
- Verification: `npx vitest run` → all pass, including the 2 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `src/components/ErrorBoundary.jsx` exists and default-exports a class component
- [ ] `grep -n "ErrorBoundary" src/App.jsx` shows the import and the wrapping element
- [ ] `npx vitest run src/__tests__/ErrorBoundary.test.jsx` → 2 tests pass
- [ ] `npx vitest run` → all tests pass (no regressions)
- [ ] `npm run lint` exits 0
- [ ] `npm run verify:typecheck` exits 0
- [ ] `git status` shows only the three in-scope files changed
- [ ] `plans/README.md` status row for 013 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/App.jsx` no longer matches the "Current state" excerpt (drift).
- `npm run verify:typecheck` fails on the class component and cannot be
  resolved with a minimal JSDoc annotation (do not disable checking or add
  `@ts-ignore` clusters).
- A test's verification fails twice after a reasonable fix attempt.
- Wrapping `<Routes>` in the boundary breaks routing (the app fails to render
  the main route in the existing App tests).

## Maintenance notes

- **Follow-up deferred out of this plan**: per-tab boundaries. Wrapping each
  tab panel in `PortfolioManagerApp.jsx` would let one broken tab fail without
  taking down navigation. Do it as a separate plan if tab-local crashes become
  a real problem.
- **Related minor gap (not fixed here)**: `src/components/DashboardTab.jsx:56`
  swallows inbox-fetch failures with `.catch(() => {})`. That is a secondary
  widget and partly intentional (it also aborts on unmount), so it is left as
  is; note it if you later add user-visible error surfacing.
- A reviewer should confirm the fallback does not itself depend on any React
  context (i18n, store) that could also have thrown.
