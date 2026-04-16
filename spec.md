# Desktop Portfolio Load Fix Spec

## Objective

Resolve the failure of the `desktop` portfolio to load transactions and NAV data by addressing the session authentication middleware configuration that incorrectly blocks local standalone development environments.

## Confirmed Context

- The app is desktop-first: Electron handles secure session tokens for the `desktop` portfolio.
- During standalone development without Electron (`npm run dev` and `npm run server`), the API lacks an injected session token.
- The `sessionAuth` middleware strictly applies a 500 error when no token is present, even in development mode.
- This causes the renderer to fail the portfolio load with the message "Desktop session credentials are missing", resulting in an empty dashboard (no transactions, no NAV).
- The underlying SQLite database correctly contains all transactions for the portfolio, and data processing (`holdingsLedger`) executes cleanly in under ~20ms.

## Root Cause

The `sessionAuth.js` middleware enforces the presence of a `PORTFOLIO_SESSION_TOKEN` universally. When running independently of Electron, the token is undefined. The backend responds with `500 SESSION_AUTH_MISCONFIGURED` to all `/api/portfolio/desktop` reads. The frontend catches this, displays a toast, and aborts the data load.

## Goals

### G1. Allow App Development Execution

The standalone development server (`NODE_ENV === 'development'`) must bypass the `sessionAuth` requirement if no token is injected.

### G2. Fix Frontend Data Loading

Resolving the 500 error will allow the frontend to successfully retrieve and process the portfolio transactions in the standalone browser experience.

### G3. Ensure Security in Production

The backend must continue to enforce session token constraints identically outside of development environments.

## Implementation Plan

### I1. Middleware Bypass for Development

Modify `server/middleware/sessionAuth.js` so that if no `sessionToken` is configured AND `process.env.NODE_ENV === "development"`, it sets `req.portfolioAuth = { mode: "development_bypass" }` and proceeds via `next()` rather than generating an error.

### I2. Explicit Environment Token Configuration

Update `.env` and `.env.example` to document `PORTFOLIO_SESSION_TOKEN=dev-secret-token` as a manual override, ensuring developers are aware of how development bypass functions.

## Verification

### V1. Standalone Dev Flow

- `npm run dev` and `npm run server` successfully load the `desktop` portfolio data without 500 errors.

### V2. Electron Flow (Preserved)

- The Electron App continues its normal unlock behavior dynamically injecting runtime session configurations.
- `npm run test:e2e` and `npm test` remain green.

## Non-Goals

- Changing the frontend UI components handling the data processing.
- Changing the SQLite retrieval mechanisms.
