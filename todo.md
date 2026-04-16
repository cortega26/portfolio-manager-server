# Todo

- [x] Investigate why the `desktop` portfolio transactions and NAV disappear.
- [x] Identify the root cause: Standard `npm run dev` development flows lack the Electron-injected session token, causing 500 errors in `sessionAuth.js` which aborts the data load.
- [x] Implement development middleware bypass in `sessionAuth.js` for standalone usage.
- [x] Update frontend `.env` configuration to use dev-token fallback.
- [x] Run `npm run test:e2e` to verify regressions.
- [x] Run `npm test` to ensure CI integrity.

## Notes

- Electron successfully manages session tokens and passes them down. The standalone usage via standard React browser (`npm run dev`) was the underlying failure due to the strict middleware.
- With the implementation of `req.portfolioAuth = { mode: "development_bypass" }` during `NODE_ENV === "development"`, developers can now preview the UI safely on browsers using SQLite data.
