import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import TransactionsTab from "../components/TransactionsTab.jsx";

let dom;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.HTMLElement;
  delete global.ResizeObserver;
});

function renderTransactionsTab(overrides = {}) {
  const addCalls = [];
  const deleteCalls = [];
  render(
    <TransactionsTab
      transactions={[]}
      onAddTransaction={(payload) => addCalls.push(payload)}
      onDeleteTransaction={(index) => deleteCalls.push(index)}
      {...overrides}
    />,
  );
  return { addCalls, deleteCalls };
}

test('submits a valid transaction payload and resets the form', () => {
  const { addCalls } = renderTransactionsTab();

  fireEvent.change(screen.getByLabelText(/Date/i), {
    target: { value: '2024-01-05' },
  });
  fireEvent.change(screen.getByLabelText(/Ticker/i), {
    target: { value: 'spy' },
  });
  fireEvent.change(screen.getByLabelText(/Type/i), {
    target: { value: 'BUY' },
  });
  fireEvent.change(screen.getByLabelText(/Amount \(USD\)/i), {
    target: { value: '1000' },
  });
  fireEvent.change(screen.getByLabelText(/Price \(USD\)/i), {
    target: { value: '100' },
  });

  fireEvent.submit(screen.getByRole('form'));

  assert.equal(addCalls.length, 1);
  assert.deepEqual(addCalls[0], {
    date: '2024-01-05',
    ticker: 'SPY',
    type: 'BUY',
    amount: -1000,
    price: 100,
    shares: 10,
  });

  assert.equal(screen.queryByText(/Please fill in all fields\./i), null);
  assert.equal(screen.getByLabelText(/Ticker/i).value, '');
});

test('shows validation feedback when required fields are missing', () => {
  renderTransactionsTab();

  fireEvent.submit(screen.getByRole('form'));

  assert.ok(screen.getByText(/Please fill in all fields\./i));
});

test('paginates transactions and preserves original indices', () => {
  const transactions = Array.from({ length: 120 }, (_, index) => ({
    date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`,
    ticker: `SYM${index}`,
    type: 'BUY',
    amount: 100 + index,
    price: 10,
    shares: 1,
  }));
  const deleteCalls = [];

  render(
    <TransactionsTab
      transactions={transactions}
      onAddTransaction={() => {}}
      onDeleteTransaction={(index) => deleteCalls.push(index)}
    />,
  );

  const initialSummary = screen.getByText(/Showing 1-50 of 120 transactions/i);
  assert.ok(initialSummary);
  assert.equal(document.querySelectorAll('tbody tr').length, 50);

  fireEvent.click(screen.getByRole('button', { name: /next page/i }));
  assert.ok(screen.getByText(/Showing 51-100 of 120 transactions/i));
  fireEvent.click(
    screen.getByRole('button', {
      name: /Undo transaction for SYM50 on 2024-01-23/i,
    }),
  );
  assert.deepEqual(deleteCalls, [50]);

  fireEvent.change(screen.getByLabelText(/Rows per page/i), {
    target: { value: '25' },
  });
  assert.ok(screen.getByText(/Showing 1-25 of 120 transactions/i));
  assert.equal(document.querySelectorAll('tbody tr').length, 25);
});
