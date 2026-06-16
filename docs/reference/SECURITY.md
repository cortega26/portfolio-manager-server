# Security Model

Portfolio Manager Unified is a **local desktop application**. It runs entirely on
your machine with no public-facing network surface.

## Architecture

- **Loopback-only API**: The Fastify backend listens on `127.0.0.1` only. No
  external network access to the API is possible.
- **Session token**: A random 256-bit token is generated per application launch
  in the Electron main process. The renderer must present this token in every
  API request. The token never touches disk.
- **PIN-protected portfolios**: Each portfolio can be locked with a local PIN,
  hashed with `crypto.scrypt` and verified with timing-safe comparison. The PIN
  hash is stored in SQLite.
- **No public endpoints**: There is no authentication via API keys, no rate
  limiting, no brute-force protection, and no audit logging — because there is
  no public attack surface. These were removed in Phase A cleanup.

## What to do if you suspect a compromise

1. The session token is ephemeral — restart the application to invalidate it.
2. If a portfolio PIN may be compromised, change it from the Settings tab.
3. Review the SQLite database at `data/storage.sqlite` for unexpected
   transactions.
4. Check `~/.portfolio-manager-unified/` for any unexpected files.

## Reporting vulnerabilities

This is a personal desktop application. If you discover a security issue, please
open a GitHub issue or contact the maintainer directly.
