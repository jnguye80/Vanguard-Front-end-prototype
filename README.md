# Momentum · Grants assistant prototype

Clickable UX prototype for **Vanguard Charitable × ASU AI Cloud Innovation Center** (project "Momentum",
Agentic Donor Engagement Platform). Scope: **grants domain, chat channel**.

It runs entirely in the browser on the **synthetic gold-layer extract** Vanguard Charitable shared
(`src/data/csv/`). The agent is a deterministic mock of the Bedrock orchestrator + Grants specialist, wired
to mock versions of the six MCP tools from the *AWS AI Grant POC — Use Case Schema & Data Model* doc.

> **Synthetic data only.** No real donor data is in this repository. The CSVs in `src/data/csv/` are the
> synthetic extract Vanguard Charitable approved for the POC. Confirm with Vanguard Charitable before making
> this repository or a GitHub Pages site public.

## Getting started

Requires **Node 20.19+** (Node 22 recommended; see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript (`tsc -b`) |
| `npm test` | Playwright: user flows plus WCAG 2.1 AA checks (first time: `npx playwright install chromium`) |
| `npm run test:a11y` | Only the WCAG 2.1 AA checks |
| `npm run check` | Everything CI runs, in order |

## Continuous integration

- `.github/workflows/ci.yml` runs on every push to `main` and every pull request: install, lint, type-check, build,
  then the Playwright suite (`tests/`). On failure, the HTML test report is attached to the run.
- `.github/workflows/pages.yml` deploys `dist/` to GitHub Pages. It runs **only when started by hand**
  (Actions → *Deploy to GitHub Pages* → *Run workflow*), because a Pages site is public. Turn it on first under
  *Settings → Pages → Source: GitHub Actions*.

### Tests

| File | Covers |
|---|---|
| `tests/flows.spec.ts` | Why-pending → picker → grounded status card · expedite → escalation → callback → rep console · free-text grant ID · all sources down → hand-off · family-member access block · out-of-scope hand-off · audit rows |
| `tests/a11y.spec.ts` | axe-core WCAG 2.1 A/AA on every view in light and dark · skip link (2.4.1) · page titles (2.4.2) · focus return (2.4.3) · keyboard tabs (2.1.1) · 320 px reflow (1.4.10) |

## What you can do

| View | What it shows |
|---|---|
| **Donor chat** | Self-service chat. Ask in your own words or tap suggestions. Grant status cards with a 4-step tracker, queue position and ETA, cited policy, escalation to a person and callback booking. |
| **Under the hood** (right panel) | Live trace for every turn, grouped as **Understand → Reason → Act → Remember**: intent and confidence, guardrails, each tool call with its SQL and latency, fallbacks, session memory. Step back through earlier turns. |
| **Rep console** | Cases the assistant escalated, live from the chat: AI summary, what the donor saw, tool log, transcript, SLA countdown, AI-drafted reply, call and resolve. |
| **Audit log** | `gold.sf_tasks`: the 100 extract rows plus every row this session writes. |

Demo controls (top of the donor view):

- **Donor**: sign in as any donor in the extract (most grants first). Suspended and inactive accounts are blocked from self-service.
- **Viewing as**: Account holder / Advisor (amounts masked) / Family member (no grant access). *Stand-ins until the real roles and data-access matrix arrive.*
- **Data scenario**: walks the fallback chain from section 10 of the schema doc:
  - *Normal*: gold layer fresh (0.6 h).
  - *Gold stale*: gold is 6.2 h old (> 4 h target), so the agent refuses to serve it and falls through to Gemini DB `TDAF_GRANT`.
  - *Athena down*: Athena times out, so the agent falls back to Gemini DB / Grant System API.
  - *All sources down*: every source fails, so the agent says it won't guess, opens a case (HITL) and offers a callback.

### Good things to try

- "Why is my grant pending?" → pick a grant → "Can this be sped up?" → book a callback → **See what the rep sees**
- "What is the status of GR-5053?" · "Is the Wright grant paid yet?" · "What is due diligence?"
- "Where's my contribution?" (out of scope: future DAF / Transactions agents)
- Switch to **Family member** and ask about a grant (authorization guardrail)
- Pick **Hill Charitable Fund** (SUSPENDED) and ask about a grant

## Project layout

```
.github/workflows/  ci.yml (lint, type-check, build, tests) · pages.yml (manual GitHub Pages deploy)
tests/              Playwright: flows.spec.ts, a11y.spec.ts
src/
  a11y/             wcag21.ts (WCAG 2.1 conformance data) · prefs.ts (text size, reduce motion)
  data/
    csv/            synthetic gold-layer extract (as shared, unmodified)
    load.ts         CSV → typed rows
    types.ts        row types (mirror the gold tables)
  agent/
    orchestrator.ts understand → reason → act → remember; escalation; callback booking
    intent.ts       rule-based intent classifier (stand-in for the Bedrock model call)
    tools.ts        the 6 MCP tools + fallback chain + audit rows
    policy.ts       grounded status explanations + guardrails (sensitive / internal flags)
    kb.ts           stand-in Knowledge Base passages (SAMPLE TEXT — replace)
    clock.ts        demo clock (starts 2026-09-30 09:00 ET, the extract's load_date)
    types.ts        trace, message, case types
  state/store.ts    shared app state (chat, trace, cases, audit) via useSyncExternalStore
  components/       DonorView (sidebar, chat, trace), MessageView (cards), RepConsole, AuditLog
```

## Going from prototype to the real agent

The UI only depends on the return shapes in `src/agent/tools.ts` and the message and trace types in
`src/agent/types.ts`. To connect the real stack:

1. Replace each tool body in `tools.ts` with a call to its AgentCore / MCP tool Lambda (keep `ctx.step(...)`
   so the trace panel keeps working; feed it from AgentCore trace events).
2. Replace `classify()` in `intent.ts` with the orchestrator's intent output.
3. Replace `kb.ts` with Bedrock Knowledge Base retrieval (`RetrieveAndGenerate` citations map onto `KbPassage`).
4. Move the guardrails in `policy.ts` to Bedrock Guardrails / the governance layer; keep the UI rules
   (never show internal flags, withhold compliance-sensitive detail, ground every date and amount).

## Accessibility (WCAG 2.1 AA, also checked against 2.2 AA)

The app has an **Accessibility** view (top navigation) that:

- reports every WCAG 2.1 success criterion (Level A and AA target; AAA listed for completeness) with its status and how the prototype meets it, linked to the W3C Recommendation (https://www.w3.org/TR/WCAG21/). The data lives in `src/a11y/wcag21.ts`.
- runs **axe-core 4.10 with the WCAG 2.1 A and AA rules** on each view, live in the browser (“Check all views”).
- offers **display settings**: text size (100 / 125 / 150%) and Reduce motion, saved per browser (`src/a11y/prefs.ts`).

Also added for WCAG 2.1:

- a Skip to main content link (2.4.1)
- per-view page titles (2.4.2)
- pausable SLA countdowns in the rep console (2.2.2)
- a note that changing the donor or role restarts the chat (3.2.2)


Last checked on 2026-10-31 with axe-core 4.10 (WCAG 2.0/2.1/2.2 A and AA plus best practice), in light and dark, across:

- the donor chat (initial, status card with an open citation, escalation and callback, advisor view)
- the rep console (summary and tool-log tabs)
- the audit log

Result: **0 violations**. Also checked by hand:

- **Contrast**: text is 4.5:1 or better in both themes. Form-field borders are 3:1 (`--field-line`). Accent text uses `--accent-text` so links stay readable on dark surfaces.
- **Keyboard**: everything is reachable with Tab. Focus returns to the message box when the control you used disappears mid-turn. Rep-console tabs follow the WAI-ARIA pattern (arrow keys, Home and End). Scrollable regions (conversation, tables) can take focus.
- **Focus visibility**: a 2px `--focus` ring everywhere, a lighter ring inside the dark trace panel, and an inset ring inside clipped lists.
- **Screen readers**: the conversation is a polite live log. Status and toasts are announced from persistent live regions. Masked amounts read "Amount hidden for your role", not dots. Grant progress is stated in words (Done, Current, Upcoming), never by colour alone.
- **Reflow**: no horizontal scrolling at 320 px. The chat comes first on narrow screens.
- **Targets**: interactive controls are at least 24 × 24 px. Most are 40 px or more.
- **Motion**: `prefers-reduced-motion` turns off animations and smooth scrolling.

To re-run the scan, start `npm run dev`, then inject axe-core in the browser console or Playwright and run `axe.run()`.

## Assumptions to confirm

- **Roles**: Advisor and Family member behaviour is invented. Waiting on Sugu's roles, personas and data access.
- **Knowledge base text** is placeholder. Replace with approved content before any external demo.
- **Escalation reasons**: `Large amount` and `Missing docs` are explained to donors. `Donor VIP` and `Sanctions review` are treated as internal-only.
- **Compliance-sensitive grants** (grantee IRS status not ACTIVE, sanctions flag, or sanctions review) are never explained in self-service. They go to a specialist.
- **Case routing** uses `sf_case_types` exactly as provided. For example, "Grant Status Inquiry" goes to Compliance with a 48 h SLA.

## Data notes (synthetic extract, 2026-09-30)

- Every grant has a `due_diligence_queue` row, including funded and closed grants. The agent only calls
  `check_due_diligence` for `PENDING_DD` grants and treats `grant_master` as the source of truth.
- Some `FUNDED` grants only have `SCHEDULED` / `PENDING_WIRE` distributions, and 6 distributions have a blank status.
  The UI trusts `grant_status` and only shows wire detail when a distribution is `WIRED` or `CLEARED`.
- `sf_case_types` and `sf_escalation_queues` contain near-duplicates ("Grant Status Inquiry (2)", "Accounting #2")
  with different teams and SLAs. The prototype uses the first, un-suffixed row.
- `review_notes` and `result_summary` are placeholder text (masked in production), so they aren't shown to donors.

## License

[MIT](LICENSE). Built by the ASU AI Cloud Innovation Center powered by AWS for Vanguard Charitable.
