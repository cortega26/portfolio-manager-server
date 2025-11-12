# Core Business & Math Findings Scoreboard

| ID | Title | Status | Owner | Last Updated | Notes / Evidence |
|----|-------|--------|-------|--------------|------------------|
| H-1 | Weekend/holiday cash-flow misalignment inflates returns | ✅ Resolved | Backend finance | 2025-10-xx | Flow alignment implemented in `server/finance/returns.js`; weekend regression added (`server/__tests__/returns.test.js`). |
| H-2 | Monthly cash interest posting ignores portfolio boundaries | ✅ Resolved | Backend finance | 2025-10-xx | Scoped accrual/posting by portfolio (`server/finance/cash.js`, `server/jobs/daily_close.js`) with new multi-portfolio tests (`server/__tests__/cash.test.js`, `server/__tests__/cash.property.test.js`). |
| M-1 | Day-count convention not applied during accrual | ✅ Resolved | Backend finance | 2025-10-xx | Policy day counts threaded through `server/finance/cash.js`; regression in `server/__tests__/cash.test.js`. |
| M-2 | Cash APY timeline overlaps silently override | ✅ Resolved | Backend finance | 2025-10-xx | Timeline normalization in `server/finance/returns.js`; regression in `server/__tests__/returns.test.js`. |
