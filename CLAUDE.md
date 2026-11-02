# CLAUDE.md

Context for Claude Code working in this repo.

## What this is
A front-end-only UX prototype of "Momentum", Vanguard Charitable's agentic grants assistant, built by the
ASU AI Cloud Innovation Center. React 19 + TypeScript + Vite, no backend. The agent and its six MCP tools are
mocked in `src/agent/` over the synthetic gold-layer CSVs in `src/data/csv/`. See README.md for the tour.

## Commands
- `npm run dev`: dev server
- `npm run build`: type-check (`tsc -b`) + production build
- `npm run lint`: oxlint

## Rules for changes
- **Grounding**: anything the donor sees about a grant (dates, amounts, reasons) must come from tool output.
  Build donor-facing sentences in `src/agent/policy.ts`, never from hard-coded copy.
- **Guardrails**: never show internal-only flags (`Donor VIP`, `Sanctions review`), raw `review_notes`, or
  detail on compliance-sensitive grants (grantee not IRS ACTIVE, sanctions flag). Route those to a person.
- **Every tool call** goes through `ctx.step(...)` (trace panel) and `ctx.audit(...)` (sf_tasks row).
- Keep the data CSVs unmodified: they are the client's synthetic extract.
- The demo clock (`src/agent/clock.ts`) starts at the extract's load date. Use `now()` and the date helpers
  there, never `new Date()`, for anything the user sees.
- Styling lives in `src/styles.css` (CSS variables at the top). Keep WCAG 2.2 AA: real buttons and labels,
  4.5:1 contrast, and status shown with text as well as colour.
- **Accessibility target is WCAG 2.1 AA.** When a change affects a success criterion, update its status and note in
  `src/a11y/wcag21.ts` (only with evidence), and re-run “Check all views” on the Accessibility page.
- Scope is the **grants domain, chat channel**. Contributions, balances and tax belong to future agents,
  so keep them as an out-of-scope handoff.

## Where things are
- Turn logic and escalation: `src/agent/orchestrator.ts`
- Intent rules: `src/agent/intent.ts`
- Tools, latency and fallback chain: `src/agent/tools.ts`
- Shared state (chat, trace, cases, audit): `src/state/store.ts`
- Chat cards: `src/components/MessageView.tsx`
