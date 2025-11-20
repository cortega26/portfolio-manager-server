// @ts-nocheck
import { expect, test } from "@playwright/test";

type Json = Record<string, unknown> | unknown[];

const transactions = [
  {
    id: "tx-deposit",
    date: "2024-01-02",
    type: "DEPOSIT",
    amount: 10000,
  },
  {
    id: "tx-buy-spy",
    date: "2024-01-02",
    type: "BUY",
    ticker: "SPY",
    shares: 10,
    amount: 4000,
    price: 400,
  },
  {
    id: "tx-dividend",
    date: "2024-01-03",
    type: "DIVIDEND",
    ticker: "SPY",
    amount: 15,
  },
  {
    id: "tx-interest",
    date: "2024-01-03",
    type: "INTEREST",
    ticker: "CASH",
    amount: 1.25,
  },
] as const;

const portfolioResponse = {
  transactions,
  signals: { SPY: { pct: 10 } },
  settings: { autoClip: true },
};

const returnsResponse = {
  series: {
    r_port: [
      { date: "2024-01-02", value: 0.01 },
      { date: "2024-01-03", value: 0.0125 },
    ],
    r_ex_cash: [
      { date: "2024-01-02", value: 0.009 },
      { date: "2024-01-03", value: 0.0105 },
    ],
    r_spy_100: [
      { date: "2024-01-02", value: 0.015 },
      { date: "2024-01-03", value: 0.02 },
    ],
    r_bench_blended: [
      { date: "2024-01-02", value: 0.013 },
      { date: "2024-01-03", value: 0.017 },
    ],
    r_cash: [
      { date: "2024-01-02", value: 0.0002 },
      { date: "2024-01-03", value: 0.0004 },
    ],
  },
  meta: { page: 1, per_page: 100, total_pages: 1, total_items: 2 },
};

const priceSeries = [
  { date: "2024-01-02", close: 400 },
  { date: "2024-01-03", close: 405 },
];

const monitoringSnapshot = {
  data: {
    cache: { hits: 0, misses: 0 },
    rateLimit: { totalRequests: 0 },
    bruteForce: { activeLocks: 0 },
  },
};

const securityStats = {
  data: { authFailures: 0, rotations: 0 },
};

const securityEvents = {
  data: [],
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Authorization",
    "X-Portfolio-Key",
    "X-Portfolio-Key-New",
  ].join(", "),
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
} as const;

function jsonResponse(payload: Json) {
  return {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
    body: JSON.stringify(payload),
  } as const;
}

test.describe("dashboard smoke flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/portfolio/**", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "*",
          },
        });
        return;
      }
      if (method === "GET") {
        await route.fulfill(jsonResponse(portfolioResponse));
        return;
      }
      if (method === "POST") {
        await route.fulfill(jsonResponse({ data: { ok: true } }));
        return;
      }
      await route.continue();
    });

    await page.route("**/returns/daily**", async (route) => {
      await route.fulfill(jsonResponse(returnsResponse));
    });

    await page.route("**/prices/**", async (route) => {
      await route.fulfill(jsonResponse(priceSeries));
    });

    await page.route("**/monitoring**", async (route) => {
      await route.fulfill(jsonResponse(monitoringSnapshot));
    });

    await page.route("**/security/stats**", async (route) => {
      await route.fulfill(jsonResponse(securityStats));
    });

    await page.route("**/security/events**", async (route) => {
      await route.fulfill(jsonResponse(securityEvents));
    });
  });

  test("authenticates and renders KPI + benchmark controls", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Portfolio ID").fill("demo-e2e");
    await page.getByLabel("API Key").fill("Supers3cure!1");
    await page.getByRole("button", { name: "Load Portfolio" }).click();

    await expect(page.getByText("Operation completed successfully.")).toBeVisible();

    const spyToggle = page.getByRole("button", { name: "100% SPY benchmark" });
    const blendedToggle = page.getByRole("button", { name: "Blended benchmark" });
    const riskToggle = page.getByRole("button", { name: "Risk sleeve (ex-cash)" });
    const cashToggle = page.getByRole("button", { name: "Cash yield" });
    const resetButton = page.getByRole("button", { name: "Reset" });

    await spyToggle.waitFor({ state: "attached" });
    await blendedToggle.waitFor({ state: "attached" });
    await riskToggle.waitFor({ state: "attached" });
    await cashToggle.waitFor({ state: "attached" });
    await resetButton.waitFor({ state: "attached" });

    await expect(spyToggle).toHaveAttribute("aria-pressed", "true");
    await expect(blendedToggle).toHaveAttribute("aria-pressed", "true");
    await expect(riskToggle).toHaveAttribute("aria-pressed", "false");
    await expect(cashToggle).toHaveAttribute("aria-pressed", "false");

    const kpiLabels = [
      "Net Asset Value",
      "Total Return",
      "Invested Capital",
      "Cash Allocation",
      "Cash Drag",
      "Benchmark Delta",
    ];

    for (const label of kpiLabels) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    await expect(page.getByText("Cash balance $6,016.25")).toBeVisible();
    await expect(
      page.getByText("Realised $0.00 · Unrealised $50.00 · ROI +1.3%"),
    ).toBeVisible();
    await expect(
      page.getByText("1 holdings tracked · Risk assets $4,050.00"),
    ).toBeVisible();
    await expect(page.getByText("59.8%"))
      .toBeVisible();
    await expect(page.getByText("SPY -0.01%"))
      .toBeVisible();
    await expect(page.getByText("Blended 0.00%"))
      .toBeVisible();

    await expect(resetButton).toBeDisabled();

    await spyToggle.click();
    await expect(spyToggle).toHaveAttribute("aria-pressed", "false");
    await expect(resetButton).toBeEnabled();

    await resetButton.click();
    await expect(spyToggle).toHaveAttribute("aria-pressed", "true");
    await expect(blendedToggle).toHaveAttribute("aria-pressed", "true");
    await expect(resetButton).toBeDisabled();
  });
});
