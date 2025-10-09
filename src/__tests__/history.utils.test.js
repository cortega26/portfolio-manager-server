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

    const timeline = buildTransactionTimeline(transactions);
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
});

