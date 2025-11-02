import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildTransactionTimeline,
  groupTransactionsByMonth,
} from "../utils/history.js";

describe("groupTransactionsByMonth", () => {
  it("tracks withdrawals as outflows even when amounts are entered as positive values", () => {
    const breakdown = groupTransactionsByMonth([
      { date: "2025-10-09", type: "DEPOSIT", amount: 500 },
      { date: "2025-10-09", type: "WITHDRAWAL", amount: 501 },
    ]);

    expect(breakdown).toHaveLength(1);
    const row = breakdown[0];
    expect(row.inflows).toBe(500);
    expect(row.outflows).toBe(501);
    expect(row.net).toBe(-1);
    expect(row.count).toBe(2);
  });
});

describe("buildTransactionTimeline", () => {
  const originalTz = process.env.TZ;
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const numberFormatter = (value, options = {}) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: options.minimumFractionDigits ?? 0,
      maximumFractionDigits: options.maximumFractionDigits ?? 6,
    }).format(value);

  const translate = (key, vars = {}) => {
    const templates = {
      "history.timeline.withdraw": "Withdrew {amount} from the account.",
      "history.timeline.deposit": "Deposited {amount} into the account.",
      "history.timeline.portfolioFallback": "Portfolio",
      "history.timeline.activityLabel": "Activity",
      "history.timeline.itemTitle": "{name} {type}",
      "history.timeline.buy": "Bought {shares} of {ticker} for {amount}.",
      "transactions.type.buy": "Buy",
      "transactions.type.withdrawal": "Withdrawal",
    };
    const template = templates[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, token) => vars[token] ?? `{${token}}`);
  };

  beforeEach(() => {
    process.env.TZ = "America/New_York";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("renders withdrawal descriptions and preserves local calendar dates", () => {
    const transactions = [
      {
        date: "2025-10-09",
        type: "WITHDRAWAL",
        amount: 501,
      },
    ];

    const timeline = buildTransactionTimeline(transactions, {
      formatCurrency: (value) => currencyFormatter.format(value),
      formatNumber: numberFormatter,
      translate,
    });
    expect(timeline).toHaveLength(1);

    const [item] = timeline;
    const expectedLabel = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(2025, 9, 9));

    expect(item.dateLabel).toBe(expectedLabel);
    expect(item.description).toContain("Withdrew $501.00");
  });

  it("renders buy transactions with localized titles and descriptions", () => {
    const transactions = [
      {
        date: "2025-02-10",
        type: "BUY",
        amount: 1234.56,
        ticker: "AAPL",
        shares: 12.345678,
      },
    ];

    const timeline = buildTransactionTimeline(transactions, {
      formatCurrency: (value) => currencyFormatter.format(value),
      formatNumber: numberFormatter,
      translate,
    });

    expect(timeline).toHaveLength(1);
    const [item] = timeline;
    expect(item.typeLabel).toBe("Buy");
    expect(item.title).toBe("AAPL Buy");
    expect(item.description).toBe("Bought 12.345678 of AAPL for $1,234.56.");
  });
});

