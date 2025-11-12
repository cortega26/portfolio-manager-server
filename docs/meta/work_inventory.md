# Workstream Document Inventory

Use this index to see which documents still drive active work and which ones simply capture historical or completed efforts. When you close a stream, move its source doc into the legacy section (or the existing `docs/legacy/` folder) and update the tables below so everyone knows the latest status.

## Current / In-Flight

| Area | Purpose | Primary files | Notes |
|------|---------|---------------|-------|
| Audits — Active evidence & scoreboards | Track the latest hardening checks and unresolved issues. | `docs/audits/reports/*.md`, `docs/audits/risk-registers/top-10-quality-risks.md`, `docs/audits/scoreboards/*.md` | Keep these files in place while findings are open. When a report is superseded, move it to Legacy and leave a pointer in the scoreboard. |
| Backlog & Future Features | Describe upcoming work, dependencies, and acceptance criteria. | `docs/backlog/cash-interest-task-table.md`, `docs/backlog/per-portfolio-cash-interest-roadmap.md`, `docs/backlog/professionalization-top-priorities.md`, `docs/backlog/persona-quick-wins.md` | Treat every file in `docs/backlog/` as “current” until all tasks are delivered. Add new future features here instead of scattering drafts under `/docs`. |
| Software update / release readiness | Runbooks, playbooks, incidents, and testing strategy that affect day-to-day upgrades. | `docs/operations/incidents/*.md`, `docs/operations/playbooks/*.md`, `docs/operations/runbooks/*.md`, `docs/operations/playbooks/testing-strategy.md` | Update these documents as new procedures emerge. They should always describe the *current* way we deploy and recover. |
| Automation prompts & maintenance guides | Guardrails for Codex agents and maintenance phases. | `docs/meta/automation/*.md` (e.g., `phase5-maintenance-prompt.md`, `codex-stabilization-prompt.md`) | These stay in “current” as long as automation relies on them. Rev older prompts into Legacy once the corresponding phase is decommissioned. |
| Research & debugging references | Inputs that feed upcoming upgrades (benchmarks, investigations, spike notes). | `docs/research/`, `docs/debug/` | Only keep open threads here; once a spike graduates into a formal proposal or concludes, archive it per the Legacy rules. |

**How to keep the “current” set clean**
1. When you start a new initiative, create the doc inside the relevant “current” folder (audits, backlog, operations, etc.).  
2. Reference the file in this table so teammates can find it quickly.  
3. Once the initiative ships, move the source doc into `docs/legacy/` (or a dated subfolder) and replace its row with a short note under **Legacy / Done**.

## Legacy / Done

| Area | What lives here | Notes |
|------|-----------------|-------|
| Completed audits & prompts | `docs/legacy/*.md` already contains the retired audit prompts, action plans, and early hardening reports. | Keep the filenames untouched so historical links remain valid. Add a changelog note in the relevant scoreboard when you archive something. |
| Archived scoreboards / references | If a scoreboard or runbook is no longer updated, move it into `docs/legacy/` and add a pointer from this section (e.g., “Frontend UI/UX audit 2024 → `docs/legacy/frontend-ui-ux-audit.md`). | Only keep the “live” scoreboard in `docs/audits/scoreboards/`. |
| Superseded backlog plans | When every task in a roadmap is complete, move the plan to `docs/legacy/backlog/` (create the folder if needed) and link it here with the completion date. | Example entry: “Per-portfolio cash interest roadmap (v1, delivered 2025-03-01) → `docs/legacy/backlog/per-portfolio-cash-interest-v1.md`.” |
| Historic release docs | Finished incident write-ups, decommissioned runbooks, and any EOL process docs. | Nest them inside `docs/legacy/operations/` so day-to-day folders stay focused on current procedures. |

Whenever you move a file:
- Update links inside README/scoreboards/backlog tables so they point to the new location.
- Add a short line in this inventory noting where the document went and why (e.g., “2025-02-14 Professionalization Hotspots → moved to legacy after CQ backlog closed”).
- If automation prompts change, ensure Codex task files (in `docs/meta/automation/`) reflect the new canonical doc paths.

Keeping this index updated is now the single source of truth for “what’s next” vs. “what’s done.”
