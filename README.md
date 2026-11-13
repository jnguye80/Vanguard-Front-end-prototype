# Momentum · Grants assistant prototype (chat and voice)

Simplified UX prototype for **Vanguard Charitable × ASU AI Cloud Innovation Center** (project "Momentum").
It shows **how a donor's question is handled, the same way on chat and on a phone call**, with
authentication and authorization as separate, visible steps, and **what the rep sees** when the assistant
hands off.

> **No real data, no data processing.** Everything runs in the browser on a small set of **fictional sample
> records** written by hand (`src/data/sample.ts`). No client data, no data connections, nothing stored or
> sent. (CIC scope: *ASU AI CIC will not process real donor data or handle production deployment.*)

## What's on the screen

Two views (top right): **Donor assistant** and **Rep console**. The donor assistant has three parts:

| Part | What it shows |
|---|---|
| **Donor and journey** (top) | Who is on the line, highlighted once verified (name, fund, donor ID, how they verified), and where they are in the journey: **reach out → verify identity → ask about a grant → get help**. The last step names the outcome: answered, general reply, or handed to a person. A failed sign-in stops the journey at verification. |
| **Chat / Voice call** (switch at the top) | The same grants assistant on two Amazon Connect channels. **Chat:** type, or tap a suggestion. **Voice:** start a simulated call, verify on the keypad, then speak (microphone where the browser allows it), tap a phrase, or type what you'd say. Replies are read aloud when the browser supports it; captions are always on. |
| **How this question was handled** | The five steps for the last message, identical for both channels, plus the **Q&A contract** for that message as JSON. |

### Not-verified donor

Not every donor can verify. The assistant handles three cases the same way on chat and voice:

| Situation | How it starts | What the donor can do |
|---|---|---|
| **Chooses not to verify** | "I don't have my donor ID" (chat chip), "I don't know my donor ID" (voice), or "I forgot my PIN" mid-call | Continue as a **guest**: general grant questions (what due diligence is, how long reviews take, how grants are paid) answered from approved policy |
| **Fails 3 times** | Wrong donor ID or PIN three times | Same as guest, but can't try verifying again in this conversation |
| **Hasn't verified yet** | Asks a question before entering an ID | Asked for the ID first; the question is kept and answered right after |

In all three:
- A question about **their own grants** ("my grant", a grant ID, "show my grants") is **blocked at authorization**. The assistant says why, and the question is kept, so verifying later (guest only) answers it straight away.
- **A person is always available.** The hand-off is marked **Not verified** in the Rep console, with the next step "Verify the caller's/visitor's identity before discussing any grant", and the summary says whether they chose not to verify or failed.
- The donor card turns amber ("Continuing as a guest" or "Locked after 3 tries"). The journey shows **Not verified** with "Skipped" or "Locked", then **Asks a general question**.
- The flow panel shows Authentication **Not verified (guest)** and Authorization **General info only** or **Blocked**. The contract's `session.level` is `guest`, `locked`, `none` or `verified`, and `authorization.decision` can be `limited`.

### Rep console

Where every hand-off lands, from either channel:

- **Chat** hand-offs arrive as a **case**; **voice** hand-offs arrive as a **transferred call** ("Pick up transferred call").
- Each case shows who it is (verified or not), the channel, the team and a pausable SLA timer.
- **Summary** tab: an AI summary, why it was handed off, the donor's words, a suggested next step, and the grant the donor saw or heard about.
- **Transcript** tab: the whole conversation, already cleaned of personal data. On a call the PIN shows as `••••`.
- **Reply** opens a reply drafted by the assistant for the rep to edit. **Mark resolved** closes the case.
- Two earlier sample cases are there from the start, and cases stay when the donor starts over.

Open it from **See what the rep sees →** on a chat hand-off, **See what the specialist sees →** after a voice transfer, or the **Rep console** tab.

### The donor journey (MVP: one persona)

The donor is someone asking about grants they requested. Same journey on both channels; only the details change:

| Step | Chat | Voice |
|---|---|---|
| 1. Reach out | Opens the chat | Calls the grants line |
| 2. Verify identity | Types their donor ID | Donor ID, then PIN, on the keypad |
| 3. Ask about a grant | Types or taps a question | Says it (or taps / types what they'd say) |
| 4. Get help | Card with the answer, a general reply, or a case for a person | The answer read aloud, a general reply, or a transfer to a person |

### The five steps

1. **Channel**: how the question arrived (typed, spoken, or keypad).
2. **Personal data guardrail**: SSN, card, bank, email and phone numbers are removed before anything else
   sees the message. Only the cleaned text is kept, and replies are checked on the way out.
3. **Authentication: who is asking?**
   - Chat: donor ID typed in the chat (stand-in for website sign-in).
   - Voice: donor ID, then a 4-digit PIN, on the keypad (stand-in for phone verification). The PIN is never
     shown or kept.
   - Three failed attempts lock it, and the assistant offers a person. A question asked before verifying is
     answered right after.
4. **Authorization: what may they see?** Verified: only grants on their own account. Another donor's grant ID
   is blocked and never looked up; a suspended account gets no grant details. Not verified: general grant
   information only (see below). Anything wider
   (advisors, family members, per-question permissions) is future work.
5. **Answer**: the Grants agent answers from grant records and approved policy, gives a **generic reply**
   (outside grants, or the planned Submissions toolset), or **hands off**: a case in chat, a transfer on a call.

### Same answer, shaped for the channel

| | Chat | Voice |
|---|---|---|
| Verify | Donor ID | Donor ID + PIN on keypad |
| Choose a grant | Tap a card | "Press 1 for…", or say the charity's name |
| Grant status | Card with tracker, facts and policy citation | The same grounded sentence, read aloud |
| Hand-off | Case created; reply within the team's hours | Transferred to a specialist, with the case |

### The Q&A contract (draft)

`src/agent/contract.ts` builds the request a channel would send for each question and the response it gets
back. It's a starting point for the integration contract, not an agreed API:

```json
{
  "request": {
    "channel": "voice",
    "session": { "authenticated": true, "level": "verified", "method": "donor_id+pin", "donor_id": "D-01" },
    "question": "Why is my grant pending?",
    "pii_removed": []
  },
  "response": {
    "outcome": "answered",
    "answer": "Your $100,000 grant to Riverbend Community Health Clinic is in charity review now. …",
    "authorization": { "decision": "allowed", "reason": "G-1001 belongs to D-01" },
    "routing": { "agent": "Grants agent", "toolset": "Due diligence", "intent": "why_pending" },
    "tools_called": ["get_donor_profile", "get_grant_status", "check_due_diligence", "search_knowledge_base"],
    "sources": ["Grant record G-1001", "Due diligence review G-1001", "Grant policy › Due diligence overview"],
    "handoff": null
  }
}
```

`outcome` is one of `answered`, `sign_in`, `generic` or `handoff`. `authorization.decision` is `allowed`,
`limited` (general information only, for a donor who isn't verified), `blocked` or `not_reached`. `handoff` carries `case_id`, `team`,
`reply_within_hours` and `mode` (`case` for chat, `transfer` for voice).

## Sample donors (fictional)

| Donor ID | Voice PIN | Account | What it shows |
|---|---|---|---|
| `D-01` | `1111` | Avery Family Giving Fund | One grant in every state |
| `D-02` | `2222` | Shah Family Fund | Overdue review; a compliance-sensitive grant the assistant won't explain |
| `D-03` | `3333` | Lee Charitable Fund | A single approved grant |
| `D-04` | `4444` | Dalton Foundation | Suspended account: no self-service |

### Things to try

- **Not verified:** tap "I don't have my donor ID" → "How long does a grant review take?" (answered) → "Why is my grant pending?" (needs verification) → enter `D-01` (now answered).
- **Chat:** ask "Why is my grant pending?" *before* signing in → enter `D-01` → pick Riverbend → "Can this be sped up?" (hand-off).
- **Chat:** signed in as `D-01`, ask about `G-2001` (another donor's grant: blocked at authorization).
- **Voice:** Start call → keypad `01#` → `1111#` → say "Why is my grant pending?" → press `1`.
- **Voice:** type "My social is 123-45-6789, what about G-1001?" while verified as `D-03` (PII removed, then blocked).
- Open **Show the Q&A contract (JSON)** after any message.

## Getting started

Requires **Node 20.19+** (Node 22 recommended; see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run lint` | oxlint |
| `npm test` | Playwright: chat and voice flows, question routing, WCAG 2.1 AA (first time: `npx playwright install chromium`) |
| `npm run check` | Everything CI runs, in order |

CI (`.github/workflows/ci.yml`) runs lint, type-check, build and tests on every push and pull request.
`pages.yml` deploys to GitHub Pages when started by hand.

### Tests

| File | Covers |
|---|---|
| `tests/flows.spec.ts` | **Not-verified donor:** guest on chat (general answer, account question blocked then answered after verifying, contract `level: guest`), guest on voice through to an unverified transfer, forgotten PIN, general questions after lockout. **Rep console:** chat case and voice transfer arrive with summary and redacted transcript (no PII, no PIN), reply and resolve, cases survive start over, filters. **Donor and journey:** highlighted once verified, journey steps on chat and voice, lockout stops at verification. **Chat:** sign-in, question before sign-in, lockout, foreign grant blocked, suspended account, grounded answer, hand-off, generic replies, PII, contract fields. **Voice:** donor ID + PIN (PIN never shown), PIN lockout, numbered choices by keypad, choosing by name, question before verifying, transfer, PII and authorization on a call. |
| `tests/questions.spec.ts` | Every question in `src/agent/questions.ts` routes to its expected intent, toolset and domain |
| `tests/a11y.spec.ts` | axe-core WCAG 2.1 A/AA on chat, voice and the rep console in light and dark · skip link · page titles · focus return · whole call by keyboard · rep tabs by arrow keys · 320 px reflow |

## Project layout

```
src/
  App.tsx              header, channel switch, sample-donor hint, layout
  components/
    DonorJourney.tsx   donor card + journey strip
    ChatPane.tsx       chat channel
    VoicePane.tsx      voice channel: call, keypad, captions, speech
    FlowPanel.tsx      the five steps + Q&A contract view
    RepConsole.tsx     case queue and case detail for hand-offs
    MessageView.tsx    chat cards (grant list, status, policy, notices, hand-off)
  agent/
    orchestrator.ts    the Q&A loop: PII → authentication → authorization → grants agent / hand-off
    contract.ts        the Q&A contract shape
    intent.ts          routing: intent, toolset, domain (stand-in for the orchestrator model)
    questions.ts       starter question set (replace with Sugu's golden set)
    pii.ts             PII redaction (stand-in for Bedrock Guardrails)
    tools.ts           mock agent tools over the sample records
    policy.ts          grounded status sentences + compliance guardrails
    kb.ts              placeholder knowledge-base passages
  data/sample.ts       FICTIONAL sample records (the only data in the repo)
  state/store.ts       app state: view, channel, call, auth, messages, last exchange, cases
```

## Going from prototype to the real agent

The UI depends only on the tool return shapes in `src/agent/tools.ts` and the `Exchange` type in
`src/agent/types.ts`. To connect the real stack, Vanguard Charitable and its implementation partner would:

1. Put Amazon Connect chat and voice in front of the same agent endpoint, sending the contract's `request`.
2. Replace the donor ID step with real authentication (website sign-in for chat; Connect IVR verification for voice).
3. Replace `classify()` with the orchestrator's routing, each tool body with the real tool call, and `kb.ts`
   with Bedrock Knowledge Base retrieval.
4. Replace `pii.ts` with Bedrock Guardrails sensitive-information filters.

## Accessibility

Built to WCAG 2.1 AA and checked by tests (above). Captions are always shown on a call, so nothing depends
on hearing the audio. Everything, including the keypad, works by keyboard. Status is shown in words as well
as colour. Light and dark themes both meet contrast. Not yet done: testing with screen-reader users.

## Not in this prototype

- DynamoDB vs Athena volume and cost (Collins's to-do): an architecture decision, not a UI one.
- Authorization beyond "own grants only", other personas, and the future mining and co-pilot layers.
- The question browser, account sidebar and accessibility report from earlier versions, left out to keep
  the prototype focused on the communication flow. (The rep console is back.)

## License

[MIT](LICENSE). Built by the ASU AI Cloud Innovation Center powered by AWS for Vanguard Charitable.
