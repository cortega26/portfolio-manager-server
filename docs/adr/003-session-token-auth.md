# ADR-003: Process-scoped session token for desktop auth

- **Status**: Accepted
- **Date**: 2024-01-01
- **Deciders**: Carlos / portfolio-manager-unified team

## Context

The app runs as an Electron desktop process; the Express API binds exclusively to
`127.0.0.1` on a random port. There is no public network surface. However, other
local processes (or malicious local software) could still reach the API. The
original codebase inherited an API-key model (public `x-api-key` header) that
was not appropriate for a local desktop context and was eventually removed.

Authentication must be:

- Automatic (no manual login for the local user)
- Scoped to the current process launch (not persistent across restarts)
- Enforced on every API request
- Not reliant on any secret that could be leaked or scraped from disk

## Decision

On each Electron `main` launch, a fresh cryptographically random session token is
generated. The token is injected into the renderer exclusively via the
`electron/preload.cjs` bridge and into the Express middleware at startup. Every
API request must include this token as the `x-session-token` header. Tokens are
never written to disk and expire when the process exits.

Per-portfolio operations additionally require a PIN (hashed with bcrypt and
stored in the database) to authorize sensitive writes.

Implementation: `server/middleware/sessionAuth.js`, `server/auth/localPinAuth.js`,
`electron/main.cjs`, `electron/preload.cjs`.

## Alternatives considered

| Option                     | Why rejected                                                             |
| -------------------------- | ------------------------------------------------------------------------ |
| Persistent API key on disk | Leaks via filesystem; does not expire; another process can read it       |
| No authentication          | Any local process could read/write portfolio data                        |
| OAuth / JWT                | Requires a server/authority; over-engineered for a single-user local app |
| OS-level keychain          | Platform-specific; adds native dependency; overkill for local loopback   |

## Consequences

- **Good**: zero persistent secret; automatically scoped per launch; negligible
  overhead; no user friction.
- **Bad**: if the renderer is compromised the token is exposed (same as any
  Electron app with a preload bridge).
- **Neutral**: PIN is an additional factor for portfolio-level writes but is
  stored as a bcrypt hash — loss of PIN requires a reset, not a server recovery.
