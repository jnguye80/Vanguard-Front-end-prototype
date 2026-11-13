# CLAUDE.md

Context for Claude Code working in this repo.

## What this is
A simplified, front-end-only UX prototype of "Momentum", Vanguard Charitable's grants assistant, built by the
ASU AI Cloud Innovation Center. React 19 + TypeScript + Vite, no backend. It shows how one question is handled
on **chat and voice** (Amazon Connect), with authentication and authorization as separate steps. The agent and
its tools are mocked in `src/agent/` over hand-written **fictional** records in `src/data/sample.ts`.

## Commands
- `npm run dev`: dev server
- `npm run build`: type-check (`tsc -b`) + production build
- `npm run lint`: oxlint
- `npm test`: Playwright (chat + voice flows, question routing, WCAG 2.1 AA)

## Rules for changes
- **Keep it simple.** Two views: the donor assistant (donor and journey strip, chat or voice, flow panel) and
  the Rep console. Don't add views or features beyond the question-and-answer mechanics without being asked.
- **Hand-offs** (`handOff` in `orchestrator.ts`) create a `CaseRecord` from the redacted conversation only:
  chat = a case, voice = a transferred call. Never put PII or a PIN in a case.
- **Same loop for both channels** (`orchestrator.ts`): PII guardrail → authentication → authorization →
  grants agent or hand-off. Shape the reply per channel (cards in chat, `toSpeech()` on a call), never the logic.
- **Authentication**: chat = donor ID; voice = donor ID + PIN on the keypad. Never show, store or log a PIN.
- **Authorization (MVP)**: only grants on the verified donor's account. Never look up another account's grant.
  Wider authorization is future work.
- **Not verified** (guest by choice, or locked after 3 tries; `guestTurn` in `orchestrator.ts`): general grant
  information from the knowledge base only. Any account-specific question is blocked; never reveal grant data.
- **PII**: every message goes through `redactPii` (`src/agent/pii.ts`) first; only redacted text is stored.
- **Grounding**: grant facts come from tool output; donor-facing grant sentences are built in `policy.ts`.
- **Guardrails**: never show internal-only flags, raw review notes, or detail on compliance-sensitive grants.
- **Exchange / contract**: each turn fills `store.exchange` (`types.ts` `Exchange`); `contract.ts` turns it into
  the Q&A contract JSON. Update both, and the README sample, if the contract changes.
- **No real or client data.** Fictional records only; no data connections, storage or network calls for data.
- Use `now()` and the date helpers in `clock.ts`, never `new Date()`, for anything the user sees.
- Keep WCAG 2.1 AA: real buttons and labels, 4.5:1 contrast in both themes, captions on calls, status in text.
- Scope is the **grants domain**. Other domains get a generic reply and an offer of a person
  (`FUTURE_DOMAINS` in `intent.ts`); Submissions is a planned toolset.
- **Question set**: `src/agent/questions.ts` is a starter set; `tests/questions.spec.ts` checks routing.

## Where things are
- Q&A loop, authentication, hand-off: `src/agent/orchestrator.ts` · contract: `src/agent/contract.ts`
- Routing: `src/agent/intent.ts` · PII: `src/agent/pii.ts` · tools: `src/agent/tools.ts`
- Donor + journey: `src/components/DonorJourney.tsx` (derived from state; no extra store fields)
- Rep side: `src/components/RepConsole.tsx`
- Channels: `src/components/ChatPane.tsx`, `src/components/VoicePane.tsx` · steps: `src/components/FlowPanel.tsx`
- State (view, channel, call, auth, exchange, cases): `src/state/store.ts`
