# P5-TEST-1 — **Rescue Playbook (FAST, deterministic, no flakiness)**

**Goal:** Finish `P5-TEST-1` quickly and reliably by using a lean test setup, **no network**, single-run coverage, and narrow scope (only the touched components).

> Run exactly what’s written here. Do **not** add mutation testing, `gitleaks`, or `npm audit`.

---

## 0) Branch and environment

```bash
git checkout -b fix/p5-test-1-rescue
npm ci --no-fund --no-audit
```

---

## 1) Ensure Vitest + RTL scaffolding exists

Install deps if missing:

```bash
npm i -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw
```

Create/update **`vitest.config.ts`** (or `.js`) with the minimal config:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      enabled: true,
      reporter: ['text-summary', 'lcov'],
      include: [
        // Only the components we touch in this task
        'src/components/**/*.{js,jsx,ts,tsx}'
      ],
      exclude: ['src/main.*', 'src/vite-env.d.ts']
    }
  }
});
```

Create/update **`src/setupTests.ts`** to add RTL matchers and guard console noise with an **allow‑list** (so harmless React warnings don’t fail the suite):

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, vi } from 'vitest';

const allowList = [
  /Warning: .*act\(\)/i,
  /StrictMode/i,
  /deprecated/i
];

const patch = (type: 'error' | 'warn') => {
  const orig = console[type];
  vi.spyOn(console, type).mockImplementation((...args: unknown[]) => {
    const msg = String(args.join(' '));
    if (allowList.some((r) => r.test(msg))) return;
    throw new Error(`console.${type}: ${msg}`);
  });
  return () => (console[type] = orig);
};

const restoreError = patch('error');
const restoreWarn = patch('warn');

afterAll(() => {
  restoreError();
  restoreWarn();
  vi.restoreAllMocks();
});

// Network guard (tests must be offline)
if (typeof process !== 'undefined') {
  process.env.NO_NETWORK_TESTS = '1';
}
```

Create **`src/__tests__/test-utils.tsx`** for routing/context wrapper:

```tsx
import { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export function renderWithProviders(
  ui: ReactNode,
  { route = '/', ...options }: { route?: string } & RenderOptions = {}
) {
  window.history.pushState({}, '', route);
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>, options);
}
```

---

## 2) Scripts (single‑run coverage + fast mode)

Update `package.json` scripts; **don’t duplicate**, adjust if present:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "test:fast": "vitest run --coverage=false --reporter=dot",
    "test:coverage": "vitest run --coverage --coverage.reporter=text-summary --coverage.reporter=lcov",
    "build": "vite build"
  }
}
```

**Important:** For this task, always use **`npm run test:coverage`** (single run).

---

## 3) Minimal specs (three flows)

Create the following files and keep them **small** and **offline**. If selectors are flaky, add `data-testid` to components (no behavioral changes).

### 3.1 Dashboard tabs — `src/__tests__/DashboardNavigation.test.tsx`
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './test-utils';
import Dashboard from '../components/Dashboard'; // adjust import

test('switches tabs and shows expected panels', async () => {
  renderWithProviders(<Dashboard />);

  // Example: click Holdings tab
  await userEvent.click(screen.getByRole('tab', { name: /holdings/i }));
  expect(screen.getByTestId('panel-holdings')).toBeInTheDocument();

  // Example: click Transactions tab
  await userEvent.click(screen.getByRole('tab', { name: /transactions/i }));
  expect(screen.getByTestId('panel-transactions')).toBeInTheDocument();
});
```

### 3.2 Transaction form validation — `src/__tests__/TransactionForm.test.tsx`
```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './test-utils';
import TransactionForm from '../components/transactions/TransactionForm'; // adjust

test('shows validation errors then submits when fixed', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<TransactionForm onSubmit={onSubmit} />);

  // Submit empty → shows errors
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));
  expect(screen.getByTestId('error-ticker')).toBeInTheDocument();

  // Fix inputs
  await userEvent.type(screen.getByLabelText(/ticker/i), 'AAPL');
  await userEvent.type(screen.getByLabelText(/quantity/i), '10');
  await userEvent.type(screen.getByLabelText(/price/i), '150');

  // Submit ok
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));
  expect(onSubmit).toHaveBeenCalled();
});
```

### 3.3 Holdings table — `src/__tests__/HoldingsTable.test.tsx`
```tsx
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import HoldingsTable from '../components/holdings/HoldingsTable'; // adjust

const rows = [
  { ticker: 'AAPL', qty: 10, value: 1500 },
  { ticker: 'MSFT', qty: 5, value: 800 }
];

test('renders table headers and rows', async () => {
  renderWithProviders(<HoldingsTable rows={rows as any} />);

  expect(screen.getByRole('table')).toBeInTheDocument();
  const body = screen.getByTestId('holdings-tbody');
  const r = within(body).getAllByRole('row');
  expect(r).toHaveLength(2);
  expect(screen.getByText(/AAPL/i)).toBeInTheDocument();
  expect(screen.getByText(/MSFT/i)).toBeInTheDocument();
});
```

> If components don’t expose stable roles/ids, add **minimal** `data-testid` attributes:
> - `data-testid="panel-holdings"`, `data-testid="panel-transactions"`
> - `data-testid="error-<field>"` for field errors
> - `data-testid="holdings-tbody"` for the rows container

---

## 4) Make tests offline and fast

- **Never** fetch live prices/data in tests. If a component imports a fetcher, stub it:
  ```ts
  vi.mock('../../shared/prices', () => ({
    fetchPrices: vi.fn(async () => ({ AAPL: 150, MSFT: 160 }))
  }));
  ```
- If your code uses `axios/fetch`, intercept with MSW or a simple `vi.mock('axios', …)`.
- If a test still waits >10s, fail fast and mock the dependency.

---

## 5) Run once, capture evidence

```bash
npm run lint
npm run test:coverage
npm run build
```

Copy the **text-summary** coverage from the terminal into:
- `docs/HARDENING_SCOREBOARD.md` row **P5-TEST-1** (commands + coverage + passed tests count)
- `README.md` (Testing section): add how to run tests and coverage

Commit:
```bash
git add -A
git commit -m "test(ui): add minimal RTL specs for tabs/form/holdings; single-run coverage; offline"
git push -u origin fix/p5-test-1-rescue
```

Open a PR titled **“P5-TEST-1: UI tests (fast, offline, single-run coverage)”** and paste the coverage text-summary.

---

## Acceptance criteria

- New tests for **tab navigation**, **transaction validation**, **holdings table**.
- **Single-run** coverage output present (no duplicate test runs).
- **Offline**: no live HTTP calls during tests.
- README and HARDENING_SCOREBOARD updated (row `P5-TEST-1`).
- CI passes.
