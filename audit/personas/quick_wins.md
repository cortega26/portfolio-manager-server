# Quick Wins (≤2h)

Ranked with **ICE (Impact × Confidence ÷ Effort)**; all are high-impact, low-complexity fixes tied to the pains above.

1. **Allow cash-only transactions without a price** — ICE ≈ 8×0.8÷2 = **3.2**
   - **Location:** `src/components/TransactionsTab.jsx`
   - **Sample diff:**
     ```diff
     -  if (!price) {
     -    missingFields.price = "Price is required.";
     -  }
     +  const cashOnly = ["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST"].includes(type);
     +  if (!cashOnly && !price) {
     +    missingFields.price = "Price is required.";
     +  }
     ...
     -  if (!Number.isFinite(priceValue) || priceValue <= 0) {
     +  if (!cashOnly && (!Number.isFinite(priceValue) || priceValue <= 0)) {
           recordError("Price must be a positive number.", { ... });
     ```
   - **Expected UX impact:** Unblocks deposits/dividends, letting users follow the README bootstrap workflow immediately.
   - **Tests/docs:** Update or add a Transactions form unit test covering cash-only submissions; confirm README examples mention optional price.

2. **Filter undefined tickers before price fetch** — ICE ≈ 7×0.9÷1 = **6.3**
   - **Location:** `src/PortfolioManagerApp.jsx`
   - **Sample diff:**
     ```diff
     - const uniqueTickers = [...new Set(transactions.map((tx) => tx.ticker))];
     + const uniqueTickers = [...new Set(
     +   transactions
     +     .map((tx) => tx.ticker)
     +     .filter((ticker) => typeof ticker === "string" && ticker.trim())
     + )];
     ```
   - **Expected UX impact:** Removes noisy `/prices/undefined` calls, improving pricing reliability for holdings and ROI cards.
   - **Tests/docs:** Add regression test in a holdings/ROI hook to assert no fetch when ticker missing.

3. **Expose ROI fetch failures to users** — ICE ≈ 6×0.8÷2 = **2.4**
   - **Location:** `src/PortfolioManagerApp.jsx` (ROI effect) + shared notification component if available.
   - **Sample diff:**
     ```diff
       try {
         const { data } = await fetchDailyReturns(...);
         ...
       } catch (error) {
-        console.error(error);
+        console.error(error);
+        setStatusBanner({
+          tone: "error",
+          message: "ROI data is temporarily unavailable. Showing cached values.",
+          requestId: error.requestId,
+        });
         try {
           const fallbackSeries = await buildRoiSeries(...);
     ```
   - **Expected UX impact:** Users know when data is stale and can quote the request ID to ops, avoiding incorrect decisions.
   - **Tests/docs:** Add Vitest covering banner state when `fetchDailyReturns` throws; document banner behaviour in README troubleshooting.

4. **Auto-refresh Admin metrics per runbook** — ICE ≈ 5×0.9÷2 = **2.25**
   - **Location:** `src/components/AdminTab.jsx`
   - **Sample diff:**
     ```diff
     useEffect(() => {
-      const controller = new AbortController();
-      let isSubscribed = true;
-      async function load() { ... }
-      load();
-      return () => { ... };
-    }, [eventLimit, refreshKey]);
+      const controller = new AbortController();
+      let isSubscribed = true;
+      async function load() { ... }
+      load();
+      const interval = setInterval(() => {
+        setRefreshKey((prev) => prev + 1);
+      }, Number(import.meta.env.VITE_ADMIN_POLL_INTERVAL_MS ?? 15000));
+      return () => {
+        clearInterval(interval);
+        isSubscribed = false;
+        controller.abort();
+      };
+    }, [eventLimit, refreshKey]);
     ```
   - **Expected UX impact:** Ops sees live lockouts and rate limits without manual clicks, aligning with the operations playbook.
   - **Tests/docs:** Add timer-mocked test ensuring polling occurs; mention auto-refresh in `docs/playbooks/frontend-operations.md` if cadence changes.

5. **Include all benchmark series in performance CSV** — ICE ≈ 5×0.85÷1 = **4.25**
   - **Location:** `src/utils/reports.js`
   - **Sample diff:**
     ```diff
     - const header = ["date", "portfolio_roi", "spy_roi", "spread"];
     + const header = [
     +   "date",
     +   "portfolio_roi",
     +   "spy_roi",
     +   "blended_roi",
     +   "ex_cash_roi",
     +   "cash_roi",
     +   "spy_spread"
     + ];
     - const rows = roiSeries.map((point) => [
     -   point.date,
     -   formatPercent(point.portfolio, 3),
     -   formatPercent(point.spy ?? 0, 3),
     -   formatPercent((point.portfolio ?? 0) - (point.spy ?? 0), 3),
     - ]);
     + const rows = roiSeries.map((point) => [
     +   point.date,
     +   formatPercent(point.portfolio, 3),
     +   formatPercent(point.spy ?? 0, 3),
     +   formatPercent(point.blended ?? 0, 3),
     +   formatPercent(point.exCash ?? 0, 3),
     +   formatPercent(point.cash ?? 0, 3),
     +   formatPercent((point.portfolio ?? 0) - (point.spy ?? 0), 3),
     + ]);
     ```
   - **Expected UX impact:** Quant exports match on-screen benchmarks, eliminating manual API merges.
   - **Tests/docs:** Update CSV snapshot test; note new columns in README reporting section.
