import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { JSDOM } from "jsdom";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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
});

test("shows validation feedback when required fields are missing", () => {
  render(
    <TransactionsTab
      transactions={[]}
      onAddTransaction={() => {}}
      onDeleteTransaction={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText(/date/i), {
    target: { value: "2024-01-01" },
  });
  fireEvent.change(screen.getByLabelText(/ticker/i), {
    target: { value: "AAPL" },
  });
  fireEvent.change(screen.getByLabelText(/amount/i), {
    target: { value: "1000" },
  });
  fireEvent.submit(screen.getByRole("form"));

  assert.ok(screen.getByText(/Please fill in all fields\./i));
});

test("hides the price input for cash-only types and accepts submissions without a price", () => {
  const addTransaction = mock.fn();

  render(
    <TransactionsTab
      transactions={[]}
      onAddTransaction={addTransaction}
      onDeleteTransaction={() => {}}
    />,
  );

  // Price is visible for equity trades by default.
  assert.ok(screen.getByLabelText(/Price/i));

  const typeSelect = screen.getByLabelText(/Type/i);
  fireEvent.change(typeSelect, { target: { value: "DEPOSIT" } });
  assert.equal(screen.queryByLabelText(/Price/i), null);

  fireEvent.change(typeSelect, { target: { value: "SELL" } });
  assert.ok(screen.getByLabelText(/Price/i));

  fireEvent.change(typeSelect, { target: { value: "DEPOSIT" } });
  assert.equal(screen.queryByLabelText(/Price/i), null);

  fireEvent.change(screen.getByLabelText(/date/i), {
    target: { value: "2024-02-10" },
  });
  fireEvent.change(screen.getByLabelText(/ticker/i), {
    target: { value: "cash" },
  });
  fireEvent.change(screen.getByLabelText(/amount/i), {
    target: { value: "2500" },
  });

  fireEvent.submit(screen.getByRole("form"));

  assert.equal(addTransaction.mock.calls.length, 1);
  const payload = addTransaction.mock.calls[0].arguments[0];
  assert.deepEqual(payload, {
    date: "2024-02-10",
    ticker: "CASH",
    type: "DEPOSIT",
    amount: 2500,
    price: 0,
    shares: 0,
  });
});

test("paginates transactions and preserves original indices", () => {
  const transactions = Array.from({ length: 120 }, (_, index) => ({
    date: `2024-01-${String((index % 28) + 1).padStart(2, "0")}`,
    ticker: `SYM${index}`,
    type: "BUY",
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

  assert.ok(screen.getByText(/Showing 1-50 of 120 transactions/i));
  const firstRowGroup = screen.getAllByRole("rowgroup")[1];
  assert.equal(within(firstRowGroup).getAllByRole("row").length, 50);

  fireEvent.click(screen.getByRole("button", { name: /next page/i }));
  assert.ok(screen.getByText(/Showing 51-100 of 120 transactions/i));
  fireEvent.click(
    screen.getByRole("button", {
      name: /Undo transaction for SYM50 on 2024-01-23/i,
    }),
  );
  assert.deepEqual(deleteCalls, [50]);

  fireEvent.change(screen.getByLabelText(/Rows per page/i), {
    target: { value: "25" },
  });
  assert.ok(screen.getByText(/Showing 1-25 of 120 transactions/i));
  const secondRowGroup = screen.getAllByRole("rowgroup")[1];
  assert.equal(within(secondRowGroup).getAllByRole("row").length, 25);
});

test("virtualizes large transaction lists, supports scrolling, and cooperates with filters", () => {
  mock.timers.activate();
  try {
    const transactions = Array.from({ length: 1200 }, (_, index) => ({
      date: `2024-02-${String((index % 28) + 1).padStart(2, "0")}`,
      ticker: `SYM${index}`,
      type: "BUY",
      amount: 100 + index,
      price: 25,
      shares: 4,
    }));
    const deleteCalls = [];

    render(
      <TransactionsTab
        transactions={transactions}
        onAddTransaction={() => {}}
        onDeleteTransaction={(index) => deleteCalls.push(index)}
      />,
    );

    assert.ok(
      screen.getByText(/Showing 1,200 of 1,200 transactions/i),
      "summary reports full virtualized count",
    );

    const virtualList = screen.getByTestId("transactions-virtual-list");
    const visibleRows = within(virtualList).getAllByRole("row");
    assert.ok(visibleRows.length < transactions.length, "rows are virtualized");

    act(() => {
      virtualList.scrollTop = 4000;
      fireEvent.scroll(virtualList);
    });

    assert.ok(
      screen.getByText(/SYM400/i),
      "row near scroll offset becomes visible",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Undo transaction for SYM0 on 2024-02-01/i }),
    );
    assert.deepEqual(deleteCalls, [0]);

    const searchInput = screen.getByLabelText(/Search transactions/i);
    fireEvent.change(searchInput, { target: { value: "sym11" } });

    act(() => {
      mock.timers.tick(300);
    });

    const summary = screen.getByText(
      /Showing 1-1 of 1 transactions \(filtered from 1,200\)/i,
    );
    assert.ok(summary, "summary reflects filtered pagination state");

    const rowgroups = screen.getAllByRole("rowgroup");
    assert.equal(
      within(rowgroups[1]).getAllByRole("row").length,
      1,
      "virtualization is disabled for small filtered lists",
    );
  } finally {
    mock.timers.reset();
  }
});

test("debounced search filters transactions after the delay", () => {
  mock.timers.activate();
  const transactions = [
    {
      date: "2024-03-01",
      ticker: "SPY",
      type: "BUY",
      amount: 1000,
      price: 100,
      shares: 10,
    },
    {
      date: "2024-03-02",
      ticker: "QQQ",
      type: "SELL",
      amount: 500,
      price: 50,
      shares: 10,
    },
    {
      date: "2024-03-03",
      ticker: "GLD",
      type: "DIVIDEND",
      amount: 20,
      price: 0,
      shares: 0,
    },
  ];

  try {
    render(
      <TransactionsTab
        transactions={transactions}
        onAddTransaction={() => {}}
        onDeleteTransaction={() => {}}
      />,
    );

    const searchInput = screen.getByLabelText(/Search transactions/i);
    fireEvent.change(searchInput, { target: { value: "qqq" } });

    assert.ok(
      screen.getByText(/Showing 1-3 of 3 transactions/i),
      "summary remains unchanged before debounce completes",
    );

    act(() => {
      mock.timers.tick(300);
    });

    assert.ok(
      screen.getByText(/Showing 1-1 of 1 transactions \(filtered from 3\)/i),
      "summary reflects filtered state after debounce",
    );
  } finally {
    mock.timers.reset();
  }
});
