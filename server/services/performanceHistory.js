import { promises as fs } from "node:fs";
import path from "node:path";

import initSqlJs from "sql.js";

import { normalizeBenchmarkConfig } from "../../shared/benchmarks.js";
import {
  ROI_CANONICAL_PERCENT_DIGITS,
} from "../../shared/precision.js";
import { readPortfolioState } from "../data/portfolioState.js";
import { toDateKey } from "../finance/cash.js";
import { d, roundDecimal } from "../finance/decimal.js";
import {
  computeDailyStates,
  externalFlowsByDate,
} from "../finance/portfolio.js";
import { computeDailyReturnRows } from "../finance/returns.js";
import { getMarketClock } from "../../src/utils/marketHours.js";

const SOURCE_R2_IMPORT = "r2_import";
const SOURCE_RECONSTRUCTED = "reconstructed";
const SOURCE_EXTENDED = "extended";
const R2_SOURCE_NAME = "mi_portfolio";
const R2_SYNC_VERSION = "2";
const DEFAULT_R2_DB_PATH = path.resolve(
  process.env.R2_PORTFOLIO_DB_PATH ?? "../mi_portfolio/portfolio.db",
);

let sqlModulePromise;

function normalizePortfolioId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decorateScopedRow(row, portfolioId) {
  if (portfolioId) {
    return { ...row, portfolio_id: portfolioId };
  }
  const next = { ...row };
  delete next.portfolio_id;
  return next;
}

function rowMatchesPortfolio(row, portfolioId) {
  const rowPortfolioId = normalizePortfolioId(row?.portfolio_id);
  if (portfolioId) {
    return rowPortfolioId === portfolioId;
  }
  return rowPortfolioId === null;
}

function filterRowsByPortfolio(rows, portfolioId) {
  const scopedRows = rows.filter((row) => rowMatchesPortfolio(row, portfolioId));
  if (portfolioId || scopedRows.length > 0) {
    return scopedRows;
  }
  return rows;
}

function clampToLastTradingDay(dateKey) {
  const todayKey = toDateKey(new Date());
  const market = getMarketClock();
  const lastTradingKey = market.lastTradingDate ?? todayKey;
  return dateKey > lastTradingKey ? lastTradingKey : dateKey;
}

function createDateRange(from, to) {
  const start = new Date(`${toDateKey(from)}T00:00:00Z`);
  const end = new Date(`${toDateKey(to)}T00:00:00Z`);
  const result = [];
  for (let current = start.getTime(); current <= end.getTime(); current += 86_400_000) {
    result.push(new Date(current).toISOString().slice(0, 10));
  }
  return result;
}

function shiftDateKey(dateKey, deltaDays) {
  const current = new Date(`${toDateKey(dateKey)}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + deltaDays);
  return current.toISOString().slice(0, 10);
}

function previousDateKey(dateKey) {
  return shiftDateKey(dateKey, -1);
}

function nextDateKey(dateKey) {
  return shiftDateKey(dateKey, 1);
}

function normalizePriceRecords(rows) {
  return rows
    .filter((row) => row?.ticker && row?.date && Number.isFinite(Number(row?.adj_close)))
    .map((row) => ({
      ticker: String(row.ticker).trim().toUpperCase(),
      date: String(row.date).trim(),
      adj_close: Number(row.adj_close),
    }))
    .sort((left, right) => {
      const dateDiff = left.date.localeCompare(right.date);
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return left.ticker.localeCompare(right.ticker);
    });
}

function buildPriceFetchWindows(rows, from, to) {
  const requestedFrom = toDateKey(from);
  const requestedTo = toDateKey(to);
  if (requestedFrom > requestedTo) {
    return [];
  }
  const dates = Array.from(
    new Set(
      rows
        .map((row) => (typeof row?.date === "string" ? row.date.trim() : ""))
        .filter((date) => date.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));

  if (dates.length === 0) {
    return [{ from: requestedFrom, to: requestedTo }];
  }

  const windows = [];
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (requestedFrom < firstDate) {
    const prefixEnd = previousDateKey(firstDate);
    if (requestedFrom <= prefixEnd) {
      windows.push({ from: requestedFrom, to: prefixEnd });
    }
  }

  if (requestedTo > lastDate) {
    const suffixStart = nextDateKey(lastDate);
    if (suffixStart <= requestedTo) {
      windows.push({ from: suffixStart, to: requestedTo });
    }
  }

  return windows;
}

function buildPriceMaps(records, tickers, dates) {
  const byDate = new Map();
  const lastPrices = new Map();
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  const sortedRecords = normalizePriceRecords(records);

  for (const date of sortedDates) {
    for (const record of sortedRecords) {
      if (record.date > date) {
        break;
      }
      if (record.date === date) {
        lastPrices.set(record.ticker, record.adj_close);
      }
    }

    const map = new Map();
    for (const ticker of tickers) {
      if (ticker === "CASH") {
        map.set("CASH", 1);
        continue;
      }
      if (lastPrices.has(ticker)) {
        map.set(ticker, lastPrices.get(ticker));
      }
    }
    byDate.set(date, map);
  }
  return byDate;
}

function buildFreshPriceLookup(records) {
  const lookup = new Set();
  for (const row of normalizePriceRecords(records)) {
    lookup.add(`${row.ticker}:${row.date}`);
  }
  return lookup;
}

function buildCumulativeFlowMap(dates, transactions) {
  const rawFlows = [...externalFlowsByDate(transactions).entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
  const running = new Map();
  let total = d(0);
  let flowIndex = 0;
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  for (const date of sortedDates) {
    while (flowIndex < rawFlows.length && rawFlows[flowIndex][0] <= date) {
      total = total.plus(rawFlows[flowIndex][1] ?? 0);
      flowIndex += 1;
    }
    running.set(date, total);
  }
  return running;
}

function buildCompositeKey(row, keyFields) {
  return keyFields.map((field) => String(row?.[field] ?? "")).join("\u0000");
}

function upsertRowsInMemory(existingRows, incomingRows, keyFields) {
  const merged = new Map();
  for (const row of existingRows) {
    merged.set(buildCompositeKey(row, keyFields), row);
  }
  for (const row of incomingRows) {
    const key = buildCompositeKey(row, keyFields);
    const current = merged.get(key);
    merged.set(key, current ? { ...current, ...row } : row);
  }
  return Array.from(merged.values());
}

function toSourceSummary(rows) {
  const summary = {};
  for (const row of rows) {
    const source =
      typeof row?.source === "string" && row.source.trim().length > 0
        ? row.source.trim()
        : SOURCE_RECONSTRUCTED;
    summary[source] = (summary[source] ?? 0) + 1;
  }
  return summary;
}

function toNumeric(value, fractionDigits = ROI_CANONICAL_PERCENT_DIGITS) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  return Number(Number(value).toFixed(fractionDigits));
}

function toNullableNumeric(value, fractionDigits = ROI_CANONICAL_PERCENT_DIGITS) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(fractionDigits));
}

function hasCanonicalInceptionBaseline(returnRows, inceptionDate) {
  if (!Array.isArray(returnRows) || returnRows.length === 0 || !inceptionDate) {
    return false;
  }
  const inceptionRow = returnRows.find((row) => row?.date === inceptionDate);
  if (!inceptionRow) {
    return false;
  }
  const rPort = Number(inceptionRow?.r_port);
  const rExCash = Number(inceptionRow?.r_ex_cash);
  return Number.isFinite(rPort)
    && Number.isFinite(rExCash)
    && Math.abs(rPort) <= 1e-8
    && Math.abs(rExCash) <= 1e-8;
}

function hasFlatZeroBenchmarkSeries(returnRows, key) {
  if (!Array.isArray(returnRows) || returnRows.length === 0 || !key) {
    return false;
  }
  const numericValues = returnRows
    .map((row) => Number(row?.[key]))
    .filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return false;
  }
  return numericValues.every((value) => Math.abs(value) <= 1e-12);
}

function benchmarkPriceHistoryMoved(priceRows, ticker, from, to) {
  const normalizedTicker = typeof ticker === "string" ? ticker.trim().toUpperCase() : "";
  if (!normalizedTicker || !Array.isArray(priceRows)) {
    return false;
  }
  const values = priceRows
    .filter(
      (row) =>
        String(row?.ticker ?? "").trim().toUpperCase() === normalizedTicker
        && typeof row?.date === "string"
        && row.date >= from
        && row.date <= to
        && Number.isFinite(Number(row?.adj_close)),
    )
    .map((row) => Number(row.adj_close));
  if (values.length < 2) {
    return false;
  }
  const first = values[0];
  return values.some((value) => Math.abs(value - first) > 1e-8);
}

function buildCumulativeReturnSeries(rows, key) {
  let cumulative = d(1);
  return rows.map((row) => {
    const step = d(row?.[key] ?? 0);
    cumulative = cumulative.times(d(1).plus(step));
    return {
      date: row.date,
      value: roundDecimal(
        cumulative.minus(1).times(100),
        ROI_CANONICAL_PERCENT_DIGITS,
      ).toNumber(),
    };
  });
}

function rebaseRoiSeries(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const baselinePoint = points.find((point) => Number.isFinite(Number(point?.value)));
  if (!baselinePoint) {
    return points.map((point) => ({ ...point }));
  }

  const baselineRatio = d(1).plus(d(baselinePoint.value).div(100));
  if (baselineRatio.lte(0)) {
    return points.map((point) => ({ ...point }));
  }

  return points.map((point) => {
    const value = Number(point?.value);
    if (!Number.isFinite(value)) {
      return { ...point, value: null };
    }

    const rebasedValue = d(1)
      .plus(d(value).div(100))
      .div(baselineRatio)
      .minus(1)
      .times(100);

    return {
      ...point,
      value: roundDecimal(rebasedValue, ROI_CANONICAL_PERCENT_DIGITS).toNumber(),
    };
  });
}

function buildFlowMatchedRoiSeries({ roiRows, returnRows, returnKey }) {
  if (!Array.isArray(roiRows) || roiRows.length === 0 || !returnKey) {
    return [];
  }
  const sortedRoiRows = [...roiRows].sort((a, b) => a.date.localeCompare(b.date));
  const returnByDate = new Map(
    (Array.isArray(returnRows) ? returnRows : [])
      .filter((row) => typeof row?.date === "string")
      .map((row) => [row.date, row]),
  );

  const series = [];
  let syntheticNav = null;
  let previousContributions = d(0);

  for (const row of sortedRoiRows) {
    const date = row?.date;
    if (typeof date !== "string" || date.trim().length === 0) {
      continue;
    }
    const netContributions = d(row?.net_contributions ?? 0);
    if (syntheticNav === null) {
      previousContributions = netContributions;
      if (netContributions.lte(0)) {
        series.push({ date, value: null });
        continue;
      }
      syntheticNav = netContributions;
      series.push({ date, value: 0 });
      continue;
    }

    const rowReturn = Number(returnByDate.get(date)?.[returnKey] ?? 0);
    const dailyReturn = Number.isFinite(rowReturn) ? d(rowReturn) : d(0);
    const flow = netContributions.minus(previousContributions);
    syntheticNav = syntheticNav.times(d(1).plus(dailyReturn)).plus(flow);
    previousContributions = netContributions;

    if (netContributions.lte(0)) {
      series.push({ date, value: null });
      continue;
    }

    series.push({
      date,
      value: roundDecimal(
        syntheticNav.minus(netContributions).div(netContributions).times(100),
        ROI_CANONICAL_PERCENT_DIGITS,
      ).toNumber(),
    });
  }

  return series;
}

function mergeSeriesByDate(seriesMap) {
  const entriesByDate = new Map();
  for (const [key, points] of Object.entries(seriesMap)) {
    for (const point of points) {
      const date = point?.date;
      if (!date) {
        continue;
      }
      const current = entriesByDate.get(date) ?? { date };
      current[key] = point.value;
      entriesByDate.set(date, current);
    }
  }
  return Array.from(entriesByDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export function buildRoiSeriesPayload({ roiRows, returnRows }) {
  const sortedRoiRows = [...roiRows].sort((a, b) => a.date.localeCompare(b.date));
  const sortedReturnRows = [...returnRows].sort((a, b) => a.date.localeCompare(b.date));

  const absoluteSeries = sortedRoiRows.map((row) => ({
    date: row.date,
    value: toNumeric(row.roi_portfolio_pct),
  }));
  const importedPortfolioSeries = rebaseRoiSeries(absoluteSeries);
  const importedSpySeries = rebaseRoiSeries(
    sortedRoiRows
    .map((row) => ({
      date: row.date,
      value: toNullableNumeric(row?.roi_sp500_pct),
    }))
    .filter((row) => row.value !== null)
    .map((row) => ({
      date: row.date,
      value: row.value,
    })),
  );
  const importedBenchSeries = rebaseRoiSeries(
    sortedRoiRows
    .map((row) => ({
      date: row.date,
      value: toNullableNumeric(row?.roi_ndx_pct),
    }))
    .filter((row) => row.value !== null)
    .map((row) => ({
      date: row.date,
      value: row.value,
    })),
  );
  const portfolioSeries = sortedReturnRows.length > 0
    ? buildFlowMatchedRoiSeries({
      roiRows: sortedRoiRows,
      returnRows: sortedReturnRows,
      returnKey: "r_port",
    })
    : importedPortfolioSeries;
  const portfolioTwrSeries = sortedReturnRows.length > 0
    ? buildCumulativeReturnSeries(sortedReturnRows, "r_port")
    : [];
  const spySeries = sortedReturnRows.length > 0
    ? buildCumulativeReturnSeries(sortedReturnRows, "r_spy_100")
    : importedSpySeries;
  const qqqSeries = sortedReturnRows.length > 0
    ? buildCumulativeReturnSeries(sortedReturnRows, "r_qqq_100")
    : importedBenchSeries;
  const benchSeries = sortedReturnRows.length > 0
    ? buildCumulativeReturnSeries(sortedReturnRows, "r_bench_blended")
    : importedBenchSeries;
  const exCashSeries = sortedReturnRows.length > 0
    ? buildCumulativeReturnSeries(sortedReturnRows, "r_ex_cash")
    : [];
  const cashSeries = sortedReturnRows.length > 0
    ? buildCumulativeReturnSeries(sortedReturnRows, "r_cash")
    : [];

  return {
    series: {
      portfolio: portfolioSeries,
      portfolioTwr: portfolioTwrSeries,
      spy: spySeries,
      qqq: qqqSeries,
      bench: benchSeries,
      exCash: exCashSeries,
      cash: cashSeries,
    },
    merged: mergeSeriesByDate({
      portfolio: portfolioSeries,
      portfolioTwr: portfolioTwrSeries,
      spy: spySeries,
      qqq: qqqSeries,
      blended: benchSeries,
      exCash: exCashSeries,
      cash: cashSeries,
    }),
    benchmarkHealth: {
      spy: {
        available: spySeries.length > 0,
        source: sortedReturnRows.length > 0 ? "returns_daily" : "roi_daily",
      },
      qqq: {
        available: qqqSeries.length > 0,
        source: sortedReturnRows.length > 0 ? "returns_daily" : "roi_daily",
      },
      blended: {
        available: benchSeries.length > 0,
        source: sortedReturnRows.length > 0 ? "returns_daily" : "roi_daily",
      },
    },
  };
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

async function openExternalDatabase(dbPath) {
  const SQL = await getSqlModule();
  const buffer = await fs.readFile(dbPath);
  return new SQL.Database(buffer);
}

function statementRows(statement) {
  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }
  statement.free();
  return rows;
}

async function readR2Snapshot(dbPath) {
  const db = await openExternalDatabase(dbPath);
  try {
    const portfolioRows = statementRows(
      db.prepare(
        `
          SELECT date, avg_price, roi_portfolio, roi_sp500, roi_ndx
          FROM portfolio
          WHERE date IS NOT NULL
          ORDER BY date ASC
        `,
      ),
    );
    const priceRows = statementRows(
      db.prepare(
        "SELECT ticker, fetched_at, price FROM prices WHERE ticker IS NOT NULL AND fetched_at IS NOT NULL ORDER BY ticker ASC, fetched_at ASC",
      ),
    );
    return { portfolioRows, priceRows };
  } finally {
    db.close();
  }
}

function normalizeR2PriceRows(rows) {
  const deduped = new Map();
  for (const row of rows) {
    const ticker = typeof row?.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
    const fetchedAt = typeof row?.fetched_at === "string" ? row.fetched_at.trim() : "";
    const date = fetchedAt ? fetchedAt.slice(0, 10) : "";
    const price = Number(row?.price);
    if (!ticker || !date || !Number.isFinite(price)) {
      continue;
    }
    deduped.set(`${ticker}:${date}`, {
      ticker,
      date,
      adj_close: price,
      source: SOURCE_R2_IMPORT,
      updated_at: new Date().toISOString(),
    });
  }
  return Array.from(deduped.values()).sort((left, right) => {
    const tickerDiff = left.ticker.localeCompare(right.ticker);
    if (tickerDiff !== 0) {
      return tickerDiff;
    }
    return left.date.localeCompare(right.date);
  });
}

function selectTransactions(rows, portfolioId) {
  if (!portfolioId) {
    return rows.filter((row) => normalizePortfolioId(row?.portfolio_id) === null);
  }
  return rows.filter((row) => normalizePortfolioId(row?.portfolio_id) === portfolioId);
}

async function fingerprintFile(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return JSON.stringify({
      path: filePath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function createPerformanceHistoryService({
  getStorage,
  priceLoader,
  logger = null,
  config = {},
  r2DbPath = DEFAULT_R2_DB_PATH,
} = {}) {
  if (typeof getStorage !== "function") {
    throw new Error("createPerformanceHistoryService requires getStorage");
  }
  if (!priceLoader || typeof priceLoader.fetchSeries !== "function") {
    throw new Error("createPerformanceHistoryService requires priceLoader");
  }
  const r2PortfolioIds = new Set(
    Array.isArray(config?.roi?.r2PortfolioIds) && config.roi.r2PortfolioIds.length > 0
      ? config.roi.r2PortfolioIds
          .map((value) => normalizePortfolioId(value))
          .filter(Boolean)
      : ["desktop"],
  );

  async function loadScopedTransactions(storage, portfolioId) {
    const transactions = await storage.readTable("transactions");
    return selectTransactions(transactions, portfolioId).sort((left, right) =>
      String(left?.date ?? "").localeCompare(String(right?.date ?? "")),
    );
  }

  async function loadCashPolicy(storage, portfolioId) {
    if (!portfolioId) {
      return await storage.readTable("cash_rates");
    }
    const state = await readPortfolioState(storage, portfolioId);
    return state?.cash ?? { currency: "USD", apyTimeline: [] };
  }

  async function syncR2Seed(storage, portfolioId, transactions, dateRange) {
    if (!portfolioId || !r2PortfolioIds.has(portfolioId)) {
      return {
        imported: false,
        available: false,
        reason: "portfolio_not_mapped_to_r2",
      };
    }
    const fingerprint = await fingerprintFile(r2DbPath);
    const syncRows = await storage.readTable("roi_sync_state");
    const existingState = syncRows.find(
      (row) =>
        rowMatchesPortfolio(row, portfolioId) && row?.source_name === R2_SOURCE_NAME,
    );

    if (!fingerprint) {
      return {
        imported: false,
        available: false,
        reason: "missing_r2_db",
      };
    }
    if (
      existingState?.source_fingerprint === fingerprint
      && existingState?.sync_version === R2_SYNC_VERSION
    ) {
      return {
        imported: false,
        available: true,
        reason: "unchanged",
        coverage_from: existingState.coverage_from ?? null,
        coverage_to: existingState.coverage_to ?? null,
      };
    }

    logger?.info?.("r2_sync_started", {
      portfolioId,
      source_path: r2DbPath,
    });

    const { portfolioRows, priceRows } = await readR2Snapshot(r2DbPath);
    const cumulativeFlows = buildCumulativeFlowMap(dateRange, transactions);
    const roiRows = portfolioRows
      .filter((row) => typeof row?.date === "string" && row.date.length > 0)
      .map((row) => {
        const date = row.date;
        const portfolioNav = Number(row?.avg_price);
        const ratio = Number(row?.roi_portfolio);
        const spyRatio = Number(row?.roi_sp500);
        const ndxRatio = Number(row?.roi_ndx);
        const netContributions = cumulativeFlows.get(date) ?? d(0);
        const roiPct = Number.isFinite(ratio)
          ? roundDecimal(d(ratio).minus(1).times(100), 6).toNumber()
          : netContributions.isZero()
            ? 0
            : roundDecimal(
                d(portfolioNav).minus(netContributions).div(netContributions).times(100),
                6,
              ).toNumber();

        return decorateScopedRow(
          {
            date,
            portfolio_nav: Number.isFinite(portfolioNav) ? portfolioNav : 0,
            net_contributions: roundDecimal(netContributions, 6).toNumber(),
            roi_portfolio_pct: roiPct,
            roi_sp500_pct: Number.isFinite(spyRatio)
              ? roundDecimal(d(spyRatio).minus(1).times(100), 6).toNumber()
              : null,
            roi_ndx_pct: Number.isFinite(ndxRatio)
              ? roundDecimal(d(ndxRatio).minus(1).times(100), 6).toNumber()
              : null,
            source: SOURCE_R2_IMPORT,
            updated_at: new Date().toISOString(),
          },
          portfolioId,
        );
      });

    const importedPrices = normalizeR2PriceRows(priceRows);

    const existingRoiDaily = await storage.readTable("roi_daily");
    const preservedRoiRows = existingRoiDaily.filter(
      (row) => !(rowMatchesPortfolio(row, portfolioId) && row?.source === SOURCE_R2_IMPORT),
    );
    const mergedRoiRows = upsertRowsInMemory(preservedRoiRows, roiRows, ["portfolio_id", "date"])
      .sort((left, right) => {
        const portfolioDiff = String(left?.portfolio_id ?? "").localeCompare(
          String(right?.portfolio_id ?? ""),
        );
        if (portfolioDiff !== 0) {
          return portfolioDiff;
        }
        return String(left?.date ?? "").localeCompare(String(right?.date ?? ""));
      });
    await storage.writeTable("roi_daily", mergedRoiRows);

    const existingPrices = await storage.readTable("prices");
    const mergedPrices = upsertRowsInMemory(existingPrices, importedPrices, ["ticker", "date"])
      .sort((left, right) => {
        const tickerDiff = String(left?.ticker ?? "").localeCompare(String(right?.ticker ?? ""));
        if (tickerDiff !== 0) {
          return tickerDiff;
        }
        return String(left?.date ?? "").localeCompare(String(right?.date ?? ""));
      });
    await storage.writeTable("prices", mergedPrices);

    const coverageFrom = roiRows[0]?.date ?? null;
    const coverageTo = roiRows[roiRows.length - 1]?.date ?? null;

    const syncStateRow = decorateScopedRow(
      {
        source_name: R2_SOURCE_NAME,
        source_fingerprint: fingerprint,
        sync_version: R2_SYNC_VERSION,
        coverage_from: coverageFrom,
        coverage_to: coverageTo,
        last_synced_at: new Date().toISOString(),
      },
      portfolioId,
    );
    const existingSyncRows = await storage.readTable("roi_sync_state");
    const mergedSyncRows = upsertRowsInMemory(
      existingSyncRows,
      [syncStateRow],
      ["portfolio_id", "source_name"],
    );
    await storage.writeTable("roi_sync_state", mergedSyncRows);

    logger?.info?.("r2_sync_completed", {
      portfolioId,
      source_path: r2DbPath,
      imported_roi_rows: roiRows.length,
      imported_price_rows: importedPrices.length,
      coverage_from: coverageFrom,
      coverage_to: coverageTo,
    });

    return {
      imported: true,
      available: true,
      coverage_from: coverageFrom,
      coverage_to: coverageTo,
    };
  }

  async function ensurePriceCoverage(storage, tickers, from, to) {
    const normalizedTickers = [...new Set(tickers)]
      .map((ticker) => String(ticker ?? "").trim().toUpperCase())
      .filter((ticker) => ticker.length > 0 && ticker !== "CASH");
    const existingRows = await storage.readTable("prices");
    const rowsByTicker = new Map();
    for (const row of existingRows) {
      const ticker = String(row?.ticker ?? "").trim().toUpperCase();
      if (!ticker) {
        continue;
      }
      const bucket = rowsByTicker.get(ticker) ?? [];
      bucket.push(row);
      rowsByTicker.set(ticker, bucket);
    }

    const fetchPlans = [];
    for (const ticker of normalizedTickers) {
      const tickerRows = rowsByTicker.get(ticker) ?? [];
      const windows = buildPriceFetchWindows(tickerRows, from, to);
      for (const window of windows) {
        fetchPlans.push({ ticker, ...window });
      }
    }

    const missingSymbols = new Set();
    const fetchedRows = await Promise.all(
      fetchPlans.map(async ({ ticker, from: windowFrom, to: windowTo }) => {
        try {
          const { prices } = await priceLoader.fetchSeries(ticker, {
            range: "max",
            from: windowFrom,
            to: windowTo,
          });
          return prices.map((point) => ({
            ticker,
            date: point.date,
            adj_close: point.close,
            updated_at: new Date().toISOString(),
          }));
        } catch (error) {
          logger?.warn?.("historical_price_fetch_failed_for_rebuild", {
            ticker,
            from: windowFrom,
            to: windowTo,
            error: error.message,
          });
          missingSymbols.add(ticker);
          return [];
        }
      }),
    );

    for (const rows of fetchedRows) {
      for (const row of rows) {
        await storage.upsertRow("prices", row, ["ticker", "date"]);
      }
    }

    if (missingSymbols.size > 0) {
      const sortedMissingSymbols = Array.from(missingSymbols).sort((left, right) =>
        left.localeCompare(right),
      );
      const error = new Error(
        `Missing historical prices for: ${sortedMissingSymbols.join(", ")}`,
      );
      error.code = "ROI_PRICE_HISTORY_MISSING";
      error.details = { missingSymbols: sortedMissingSymbols };
      throw error;
    }
  }

  async function rebuildPersistentSeries(storage, portfolioId, transactions, from, to) {
    const benchmarkConfig = normalizeBenchmarkConfig(config?.benchmarks ?? {});
    const trackedTickers = new Set(["SPY"]);
    for (const ticker of benchmarkConfig.tickers) {
      trackedTickers.add(ticker);
    }
    for (const transaction of transactions) {
      if (transaction?.ticker) {
        trackedTickers.add(String(transaction.ticker).trim().toUpperCase());
      }
    }

    await ensurePriceCoverage(storage, Array.from(trackedTickers), from, to);

    const priceRecords = (await storage.readTable("prices")).filter(
      (row) => typeof row?.date === "string" && row.date >= from && row.date <= to,
    );
    const dates = normalizePriceRecords(priceRecords)
      .filter((row) => trackedTickers.has(row.ticker) && row.date >= from && row.date <= to)
      .map((row) => row.date);
    const uniqueDates = Array.from(new Set(dates)).sort((left, right) =>
      left.localeCompare(right),
    );

    if (uniqueDates.length === 0) {
      return {
        dates: [],
        states: [],
        returnRows: [],
        navRows: [],
      };
    }

    const pricesByDate = buildPriceMaps(priceRecords, Array.from(trackedTickers), uniqueDates);
    const states = computeDailyStates({
      transactions,
      pricesByDate,
      dates: uniqueDates,
    });

    const freshPriceLookup = buildFreshPriceLookup(priceRecords);
    const navRows = states.map((state) => {
      const stalePrice = Object.entries(state.holdings ?? {}).some(([ticker, shares]) => {
        if (ticker === "CASH" || !Number.isFinite(Number(shares)) || Number(shares) === 0) {
          return false;
        }
        return !freshPriceLookup.has(`${ticker}:${state.date}`);
      });

      return decorateScopedRow(
        {
          date: state.date,
          portfolio_nav: state.nav,
          ex_cash_nav: Number((state.nav - state.cash).toFixed(6)),
          cash_balance: state.cash,
          risk_assets_value: state.riskValue,
          stale_price: stalePrice,
          updated_at: new Date().toISOString(),
        },
        portfolioId,
      );
    });

    const cashPolicy = await loadCashPolicy(storage, portfolioId);
    const spyPrices = new Map(
      normalizePriceRecords(priceRecords)
        .filter((row) => row.ticker === "SPY")
        .map((row) => [row.date, row.adj_close]),
    );
    const qqqPrices = new Map(
      normalizePriceRecords(priceRecords)
        .filter((row) => row.ticker === "QQQ")
        .map((row) => [row.date, row.adj_close]),
    );
    const returnRows = computeDailyReturnRows({
      states,
      cashPolicy,
      spyPrices,
      qqqPrices,
      transactions,
    }).map((row) => decorateScopedRow({ ...row, updated_at: new Date().toISOString() }, portfolioId));

    await storage.deleteWhere("nav_snapshots", (row) => rowMatchesPortfolio(row, portfolioId));
    await storage.deleteWhere("returns_daily", (row) => rowMatchesPortfolio(row, portfolioId));
    for (const row of navRows) {
      await storage.upsertRow("nav_snapshots", row, ["portfolio_id", "date"]);
    }
    for (const row of returnRows) {
      await storage.upsertRow("returns_daily", row, ["portfolio_id", "date"]);
    }

    return { dates: uniqueDates, states, returnRows, navRows };
  }

  async function ensureAbsoluteRoiRows(storage, portfolioId, states, importedCoverage) {
    if (!Array.isArray(states) || states.length === 0) {
      return [];
    }
    const transactions = await loadScopedTransactions(storage, portfolioId);
    const cumulativeFlows = buildCumulativeFlowMap(
      states.map((state) => state.date),
      transactions,
    );
    const existingRows = filterRowsByPortfolio(await storage.readTable("roi_daily"), portfolioId);
    const existingByDate = new Map(existingRows.map((row) => [row.date, row]));
    const importedStart = importedCoverage?.coverage_from ?? null;
    const importedEnd = importedCoverage?.coverage_to ?? null;

    const rowsToWrite = [];
    for (const state of states) {
      const existing = existingByDate.get(state.date);
      if (existing?.source === SOURCE_R2_IMPORT) {
        const nextImported = {
          ...existing,
          net_contributions: roundDecimal(cumulativeFlows.get(state.date) ?? 0, 6).toNumber(),
          updated_at: new Date().toISOString(),
        };
        rowsToWrite.push(decorateScopedRow(nextImported, portfolioId));
        continue;
      }

      const netContributions = cumulativeFlows.get(state.date) ?? d(0);
      const roiPct = netContributions.isZero()
        ? 0
        : roundDecimal(
            d(state.nav).minus(netContributions).div(netContributions).times(100),
            6,
          ).toNumber();
      const source =
        importedStart && state.date < importedStart
          ? SOURCE_RECONSTRUCTED
          : importedEnd && state.date > importedEnd
            ? SOURCE_EXTENDED
            : SOURCE_RECONSTRUCTED;
      rowsToWrite.push(
        decorateScopedRow(
          {
            date: state.date,
            portfolio_nav: state.nav,
            net_contributions: roundDecimal(netContributions, 6).toNumber(),
            roi_portfolio_pct: roiPct,
            source,
            updated_at: new Date().toISOString(),
          },
          portfolioId,
        ),
      );
    }

    for (const row of rowsToWrite) {
      await storage.upsertRow("roi_daily", row, ["portfolio_id", "date"]);
    }
    return rowsToWrite;
  }

  async function ensureRange({ portfolioId, from, to } = {}) {
    const storage = await getStorage();
    const normalizedPortfolioId = normalizePortfolioId(portfolioId);
    const transactions = await loadScopedTransactions(storage, normalizedPortfolioId);
    if (transactions.length === 0) {
      return {
        repaired: false,
        reason: "no_transactions",
        portfolioId: normalizedPortfolioId,
        roiRows: [],
        returnRows: [],
        navRows: [],
      };
    }

    const orderedDates = transactions
      .map((tx) => String(tx?.date ?? "").trim())
      .filter((date) => date.length > 0)
      .sort((left, right) => left.localeCompare(right));
    const requestedFrom = typeof from === "string" && from.trim().length > 0
      ? from.trim()
      : orderedDates[0];
    const todayKey = toDateKey(new Date());
    const upperBound = clampToLastTradingDay(todayKey);
    const requestedTo = typeof to === "string" && to.trim().length > 0
      ? to.trim()
      : upperBound;
    const effectiveFrom = requestedFrom < orderedDates[0] ? orderedDates[0] : requestedFrom;
    const effectiveTo = requestedTo > upperBound ? upperBound : requestedTo;

    const r2Sync = await syncR2Seed(
      storage,
      normalizedPortfolioId,
      transactions,
      createDateRange(orderedDates[0], effectiveTo),
    );
    const rebuilt = await rebuildPersistentSeries(
      storage,
      normalizedPortfolioId,
      transactions,
      orderedDates[0],
      effectiveTo,
    );
    const roiRows = await ensureAbsoluteRoiRows(
      storage,
      normalizedPortfolioId,
      rebuilt.states,
      r2Sync,
    );

    const filteredRoiRows = filterRowsByPortfolio(
      await storage.readTable("roi_daily"),
      normalizedPortfolioId,
    ).filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo)
      .sort((left, right) => left.date.localeCompare(right.date));
    const filteredReturnRows = filterRowsByPortfolio(
      await storage.readTable("returns_daily"),
      normalizedPortfolioId,
    ).filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo)
      .sort((left, right) => left.date.localeCompare(right.date));
    const filteredNavRows = filterRowsByPortfolio(
      await storage.readTable("nav_snapshots"),
      normalizedPortfolioId,
    ).filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo)
      .sort((left, right) => left.date.localeCompare(right.date));

    return {
      repaired: true,
      portfolioId: normalizedPortfolioId,
      from: effectiveFrom,
      to: effectiveTo,
      importedR2: r2Sync,
      roiRows: filteredRoiRows,
      returnRows: filteredReturnRows,
      navRows: filteredNavRows,
      sourceSummary: toSourceSummary(filteredRoiRows.length > 0 ? filteredRoiRows : roiRows),
    };
  }

  async function getRoiPayload(options = {}) {
    const storage = await getStorage();
    const normalizedPortfolioId = normalizePortfolioId(options?.portfolioId);
    const transactions = await loadScopedTransactions(storage, normalizedPortfolioId);
    if (transactions.length === 0) {
      return {
        series: {
          portfolio: [],
          portfolioTwr: [],
          spy: [],
          bench: [],
          exCash: [],
          cash: [],
        },
        merged: [],
        meta: {
          primaryMetric: "portfolio",
          secondaryMetric: "portfolioTwr",
          portfolioId: normalizedPortfolioId,
          from: null,
          to: null,
          sourceSummary: {},
          importedR2: {
            imported: false,
            available: false,
            reason: "no_transactions",
          },
        },
      };
    }
    const orderedDates = transactions
      .map((tx) => String(tx?.date ?? "").trim())
      .filter((date) => date.length > 0)
      .sort((left, right) => left.localeCompare(right));
    const requestedFrom = typeof options?.from === "string" && options.from.trim().length > 0
      ? options.from.trim()
      : orderedDates[0];
    const todayKey = toDateKey(new Date());
    const upperBound = clampToLastTradingDay(todayKey);
    const requestedTo = typeof options?.to === "string" && options.to.trim().length > 0
      ? options.to.trim()
      : upperBound;
    const effectiveFrom = requestedFrom < orderedDates[0] ? orderedDates[0] : requestedFrom;
    const effectiveTo = requestedTo > upperBound ? upperBound : requestedTo;

    const r2Sync = await syncR2Seed(
      storage,
      normalizedPortfolioId,
      transactions,
      createDateRange(orderedDates[0], effectiveTo),
    );
    const allRoiRows = filterRowsByPortfolio(
      await storage.readTable("roi_daily"),
      normalizedPortfolioId,
    )
      .sort((left, right) => left.date.localeCompare(right.date));
    const allReturnRows = filterRowsByPortfolio(
      await storage.readTable("returns_daily"),
      normalizedPortfolioId,
    )
      .sort((left, right) => left.date.localeCompare(right.date));
    let roiRows = allRoiRows
      .filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo)
      .sort((left, right) => left.date.localeCompare(right.date));
    let returnRows = allReturnRows
      .filter((row) => row.date >= effectiveFrom && row.date <= effectiveTo)
      .sort((left, right) => left.date.localeCompare(right.date));
    const allPriceRows = await storage.readTable("prices");
    const needsQqqRepair =
      hasFlatZeroBenchmarkSeries(returnRows, "r_qqq_100")
      && benchmarkPriceHistoryMoved(allPriceRows, "QQQ", effectiveFrom, effectiveTo);

    const needsReturnsRepair =
      returnRows.length === 0
      || (effectiveFrom && (!returnRows[0]?.date || returnRows[0].date > effectiveFrom))
      || (effectiveTo && (!returnRows[returnRows.length - 1]?.date || returnRows[returnRows.length - 1].date < effectiveTo))
      || !returnRows.every(
        (row) =>
          typeof row?.r_spy_100 === "number"
          && Number.isFinite(row.r_spy_100)
          && typeof row?.r_qqq_100 === "number"
          && Number.isFinite(row.r_qqq_100)
          && typeof row?.r_bench_blended === "number"
          && Number.isFinite(row.r_bench_blended),
      )
      || needsQqqRepair
      || !hasCanonicalInceptionBaseline(allReturnRows, orderedDates[0]);

    if (roiRows.length === 0 || needsReturnsRepair) {
      try {
        const repaired = await ensureRange(options);
        roiRows = repaired.roiRows;
        returnRows = repaired.returnRows;
        const payload = buildRoiSeriesPayload({
          roiRows,
          returnRows,
        });
        return {
          ...payload,
          meta: {
            primaryMetric: "portfolio",
            secondaryMetric: "portfolioTwr",
            portfolioId: repaired.portfolioId,
            from: repaired.from ?? null,
            to: repaired.to ?? null,
            sourceSummary: repaired.sourceSummary,
            importedR2: repaired.importedR2,
            benchmarkHealth: payload.benchmarkHealth,
          },
        };
      } catch (repairError) {
        logger?.warn?.("roi_repair_failed_serving_existing", {
          error: repairError.message,
          code: repairError.code,
          hasExistingRows: roiRows.length > 0,
        });
        if (roiRows.length === 0 && returnRows.length === 0) {
          throw repairError;
        }
      }
    }

    const payload = buildRoiSeriesPayload({
      roiRows,
      returnRows,
    });
    return {
      ...payload,
      meta: {
        primaryMetric: "portfolio",
        secondaryMetric: "portfolioTwr",
        portfolioId: normalizedPortfolioId,
        from: effectiveFrom,
        to: roiRows[roiRows.length - 1]?.date ?? effectiveTo,
        sourceSummary: toSourceSummary(roiRows),
        importedR2: r2Sync,
        benchmarkHealth: payload.benchmarkHealth,
      },
    };
  }

  async function getLegacyRows(options = {}) {
    return ensureRange(options);
  }

  return {
    ensureRange,
    getLegacyRows,
    getRoiPayload,
  };
}

export default createPerformanceHistoryService;
