# AGENTS.md

Context governance for this repository. Does not describe code — that lives in `CLAUDE.md` (commands, architecture, conventions, project structure).

## Role boundary

| File                   | Purpose                                                                 | Loaded        |
| ---------------------- | ----------------------------------------------------------------------- | ------------- |
| `CLAUDE.md`            | Commands, architecture, conventions, project structure                  | Every session |
| `AGENTS.md`            | Context loading policy, document map, task-type strategy, hygiene rules | Every session |
| `AGENTS_QUICKSTART.md` | Quick operational commands for agents                                   | On demand     |

For build commands, test runners, architecture, project structure → see `CLAUDE.md`.

## Document map

- Operational rules & constraints: `context/CONSTRAINTS.md`
- Confirmed project invariants: `context/KNOWN_INVARIANTS.md`
- System boundaries and flows: `context/ARCHITECTURE.md`
- Module index and entrypoints: `context/MODULE_INDEX.md`
- Shortcuts by task type: `context/TASK_ENTRYPOINTS.md`
- Active work, hypotheses: `context/runtime/ACTIVE_TASK.md`
- Architecture decisions: `docs/adr/`
- Broad status & backlog: `docs/reference/portfolio-manager-unified-status.md`, `docs/backlog/portfolio-manager-unified-next-steps.md`

A link is not an autoload. Only load what the task type needs.

## Load order

1. User's explicit instructions
2. `AGENTS.md` (this file — governance)
3. `CLAUDE.md` (codebase facts — commands, architecture)
4. `AGENTS_QUICKSTART.md` (operational shortcuts)
5. Code, tests, `package.json`, observable config
6. `context/KNOWN_INVARIANTS.md`
7. `context/CONSTRAINTS.md`
8. `context/ARCHITECTURE.md`
9. `context/MODULE_INDEX.md`
10. `context/TASK_ENTRYPOINTS.md`
11. `context/runtime/ACTIVE_TASK.md`
12. `docs/reference/portfolio-manager-unified-status.md`
13. `docs/backlog/portfolio-manager-unified-next-steps.md`

Resolution rules:

- If any doc in 5–10 contradicts 4, verify against real code first.
- If a fact is temporary, don't promote it to a stable doc.
- If a task has active context, constrain `ACTIVE_TASK.md` to that task — not general repo truth.

## Loading policy by task type

### Always

- `AGENTS.md`
- `CLAUDE.md`

### New features

- `context/CONSTRAINTS.md`
- `context/KNOWN_INVARIANTS.md`
- `context/ARCHITECTURE.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md` — if you need to land fast by flow type
- `context/runtime/ACTIVE_TASK.md` — only if related work exists
- `docs/reference/portfolio-manager-unified-status.md` + `docs/backlog/portfolio-manager-unified-next-steps.md` — only if the feature depends on current state or an open phase

### Bugs

- `context/CONSTRAINTS.md`
- `context/KNOWN_INVARIANTS.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md`
- `context/runtime/ACTIVE_TASK.md`
- `context/ARCHITECTURE.md` — only if the bug crosses Electron, auth, storage, or process boundaries

### Refactors

- `context/CONSTRAINTS.md`
- `context/ARCHITECTURE.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md`
- `context/KNOWN_INVARIANTS.md` — only if touching finance, import, auth, storage, or critical contracts

### Audits

- `context/CONSTRAINTS.md`
- `context/KNOWN_INVARIANTS.md`
- `context/ARCHITECTURE.md`
- `context/MODULE_INDEX.md`
- `context/TASK_ENTRYPOINTS.md` — if audit needs flow entrypoints
- `context/runtime/ACTIVE_TASK.md` — only if scoped to an active incident or change

## Rules

- Inspect real code and tests before proposing changes.
- Keep changes small, traceable, and reversible.
- Validate with `npm test` after relevant changes (see `CLAUDE.md` for exact commands).
- Stop if the baseline is broken or a critical invariant is compromised.
- Don't assume prior documentation reflects reality if it contradicts code.
- Mark hypotheses and confirmed facts separately when the task depends on runtime context.
- **No tooling assumption**: if a tool is unavailable, do directed repo inspection and cite the limitation. Tooling availability is not a stable project truth.

## Document hygiene

- No rule duplication across files.
- No conversational history in stable docs.
- Don't turn `ACTIVE_TASK.md` into a backlog or changelog.
- Use `status` and `backlog` as broad context, not universal autoload.
