// The question-and-answer loop, the same for both channels (Amazon Connect chat and voice):
//
//   1. Channel        the donor's words arrive (typed in chat; spoken or keyed on a call)
//   2. PII guardrail  personal data is removed before anything else sees the message
//   3. Authentication who is this? Chat: donor ID. Voice: donor ID, then a PIN on the keypad.
//   4. Authorization  what may they see? MVP: only grants on their own account.
//   5. Grants agent   route to a toolset, call the tools, answer only from what they return,
//                     or hand off to a person (a case in chat, a transfer on a call).
//
// Each turn produces an `Exchange` (src/agent/types.ts): the flow panel draws it, and it is the shape of
// the lightweight Q&A contract.

import { demoDonors, dueDiligence, grants } from '../data/sample';
import type { DueDiligence, Grant } from '../data/types';
import {
  DEFAULT_SUGGESTIONS, SIGN_IN_SUGGESTIONS, VOICE_SIGN_IN_SUGGESTIONS, store, uid,
  type Chip, type Memory, type TurnInput,
} from '../state/store';
import { fmtMoney, now } from './clock';
import { classify, FUTURE_DOMAINS, toolsetLabel, TOOLSETS, type Classification, type Intent } from './intent';
import { containsPii, describeFindings, redactPii } from './pii';
import { buildStatusView, sensitivity, statusLabel } from './policy';
import {
  checkDueDiligence, createServiceRequest, getDonorProfile, getGrantStatus,
  listGrants, readQueue, searchKnowledgeBase, verifyCaller, type ToolCtx,
} from './tools';
import type { AgentMessage, CaseRecord, Exchange, GrantStatusView, Phase, TraceKind } from './types';

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewMessage = DistOmit<AgentMessage, 'id'>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DONOR_ID = /\bd-?(\d{2})\b/i;
const MAX_ATTEMPTS = 3;
/** "I don't have my donor ID", "forgot my PIN", "continue without signing in"… */
const NO_ID = /\b(don[’']?t|do not|can[’']?t|cannot)\s+(have|know|remember|find)\b|\bforgot\b|\bwithout (signing in|verifying|an? id)\b|\b(no|lost) (donor )?(id|pin)\b|\bas a guest\b|\bskip\b/i;

export const AUTH_METHOD = {
  chat: 'Donor ID typed in chat (stand-in for website sign-in)',
  voice: 'Donor ID + PIN on the keypad (stand-in for phone verification)',
} as const;

const isVoice = () => store.get().channel === 'voice';

// ------------------------------------------------------------------ helpers

function makeCtx(turn: number): ToolCtx {
  return {
    step(phase: Phase, kind: TraceKind, label: string, detail: string) {
      const id = uid('t');
      store.set((st) => ({ trace: [...st.trace, { id, turn, phase, kind, label, detail, status: 'running' }] }));
      return {
        finish(status, d) {
          store.set((st) => ({ trace: st.trace.map((e) => (e.id === id ? { ...e, status, detail: d ?? e.detail } : e)) }));
        },
      };
    },
  };
}

function say(m: NewMessage): string {
  const id = uid('m');
  store.set((s) => ({ messages: [...s.messages, { ...m, id } as AgentMessage] }));
  return id;
}

function patchMessage(id: string, fn: (m: AgentMessage) => AgentMessage) {
  store.set((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }));
}

function setExchange(patch: Partial<Exchange> | ((e: Exchange) => Partial<Exchange>)) {
  store.set((s) => {
    if (!s.exchange) return {};
    const p = typeof patch === 'function' ? patch(s.exchange) : patch;
    return { exchange: { ...s.exchange, ...p } };
  });
}

const addSource = (src: string) => setExchange((e) => ({ sources: e.sources.includes(src) ? e.sources : [...e.sources, src] }));
const allow = (detail: string) => setExchange({ authorization: { status: 'allowed', detail } });
const block = (detail: string) => setExchange({ authorization: { status: 'blocked', detail } });

function remember(patch: Partial<Memory>) {
  store.set((s) => ({ memory: { ...s.memory, ...patch } }));
}

const chips = (...labels: string[]): Chip[] => labels.map((label) => ({ label, input: { type: 'text', text: label } }));

function currentDonor() {
  const id = store.get().auth.donorId;
  return id ? demoDonors().find((d) => d.donor.donor_id === id)?.donor : undefined;
}

function authNow(): Exchange['authentication'] {
  const { auth, channel } = store.get();
  const method = AUTH_METHOD[channel];
  if (auth.donorId) return { status: 'verified', method, donorId: auth.donorId, detail: `Verified as ${auth.donorId}` };
  if (auth.locked) return { status: 'locked', method, detail: `Stopped after ${MAX_ATTEMPTS} failed attempts · general questions only` };
  if (auth.guest) return { status: 'guest', method, detail: 'Continuing without verifying · general questions only' };
  if (auth.candidateId) return { status: 'needed', method, donorId: auth.candidateId, detail: `Donor ID ${auth.candidateId} found · waiting for PIN` };
  return { status: 'needed', method, detail: 'Not verified yet' };
}

// ------------------------------------------------------------------ how each message reads in each channel

/** Chat transcript text (also used for the output guardrail). */
export function messageToText(m: AgentMessage): string {
  if (m.role === 'user') return m.text;
  switch (m.kind) {
    case 'text': return m.text;
    case 'grant_picker': return `${m.prompt} ${m.grants.map((x) => `${x.grant.grantee_name} (${x.statusLabel})`).join('; ')}`;
    case 'grant_status': return m.view.explanation;
    case 'kb_answer': return m.text;
    case 'notice': return `${m.title}. ${m.body}`;
    case 'handoff': return handoffText(m);
  }
}

/** What the assistant says out loud on a call. No cards on the phone: lists become numbered choices. */
export function toSpeech(m: AgentMessage): string {
  if (m.role === 'user') return m.text;
  switch (m.kind) {
    case 'text': return m.text;
    case 'grant_picker':
      return `${m.prompt} ${m.grants.map((x, i) => `Press ${i + 1} for ${x.grant.grantee_name}, ${fmtMoney(x.grant.grant_amount_usd)}.`).join(' ')} Or say the charity’s name.`;
    case 'grant_status': return m.view.explanation;
    case 'kb_answer': return `${m.text} That’s from our grant policy.`;
    case 'notice': return m.body;
    case 'handoff': return handoffText(m);
  }
}

function handoffText(m: Extract<AgentMessage, { kind: 'handoff' }>) {
  return m.mode === 'transfer'
    ? `I’m transferring you to our ${m.team} team now. They’ll see what we talked about, so you won’t need to repeat yourself. Your case number is ${m.caseId}.`
    : `I’ve passed this to our ${m.team} team as case ${m.caseId}. They’ll reply within ${m.responseHours} hours, and they’ll see this conversation.`;
}

// ------------------------------------------------------------------ entry point

export async function runTurn(input: TurnInput) {
  const s0 = store.get();
  if (s0.busy || s0.auth.locked && !s0.auth.donorId && input.type === 'keypad') return;
  if (s0.channel === 'voice' && s0.call !== 'active') return;
  const turn = s0.turn + 1;

  // What the user did, as the transcript shows it. A PIN is never shown or stored.
  const pinStage = s0.channel === 'voice' && !!s0.auth.candidateId && !s0.auth.donorId;
  let raw: string;
  if (input.type === 'keypad') raw = pinStage ? `Keypad: ${'•'.repeat(input.digits.replace(/\D/g, '').length)}` : `Keypad: ${input.digits}`;
  else if (input.type === 'pick_grant') raw = input.label;
  else raw = input.text;
  const pinSpoken = pinStage && input.type === 'text' && /^\D*\d{4}\D*$/.test(input.text);
  if (pinSpoken) raw = '••••';

  // 2. PII guardrail first: nothing downstream (transcript, flow panel, contract, case) sees the raw text.
  const { text: userText, findings } = redactPii(raw);
  store.set((s) => ({
    busy: true, turn, suggestions: [],
    messages: [...s.messages, { id: uid('m'), role: 'user', text: userText }],
    exchange: {
      turn, channel: s.channel, question: userText,
      piiRemoved: [...new Set(findings.map((f) => f.label))],
      authentication: authNow(),
      authorization: { status: 'not_reached', detail: 'No account data needed yet' },
      tools: [], sources: [], answer: '', outcome: 'answered',
    },
  }));
  if (findings.length) {
    say({
      role: 'agent', kind: 'notice', tone: 'lock', title: 'I removed personal information from your message',
      body: `For your security I removed ${describeFindings(findings)}. I never need it to look up a grant, so please don’t share it here.`,
    });
  }

  const ctx = makeCtx(turn);
  const before = store.get().messages.length;
  const effective: TurnInput =
    input.type === 'text' ? { type: 'text', text: pinSpoken ? input.text : userText } : input;
  try {
    await sleep(160 + Math.random() * 80);
    await handle(ctx, effective, userText);
  } catch (err) {
    console.error(err);
    say({ role: 'agent', kind: 'notice', tone: 'error', title: 'Something went wrong', body: 'I couldn’t finish that. You can try again or talk to a person.' });
    store.set({ suggestions: chips('Talk to a person') });
  } finally {
    const replies = store.get().messages.slice(before).filter((m) => m.role === 'agent');
    const answer = replies.map(isVoice() ? toSpeech : messageToText).join(' ');
    const leaked = containsPii(answer);
    const tools = [...new Set(store.get().trace.filter((e) => e.turn === turn && ['tool', 'kb', 'auth', 'write'].includes(e.kind)).map((e) => e.label))];
    setExchange({ answer: leaked ? '[blocked by output guardrail]' : answer, tools, authentication: authNow() });
    store.set({ busy: false });
  }
}

async function handle(ctx: ToolCtx, input: TurnInput, userText: string): Promise<void> {
  const s = store.get();

  // 3. AUTHENTICATION -------------------------------------------------------
  if (!s.auth.donorId) return authenticate(ctx, input, userText);

  const donor = currentDonor()!;
  const donorGrants = grants.filter((g) => g.donor_id === donor.donor_id);

  // Keypad on a verified call: a number picks from the list just offered, 0 asks for a person.
  if (input.type === 'keypad') {
    const d = input.digits.replace(/\D/g, '');
    if (d === '0') return handle(ctx, { type: 'text', text: 'Talk to a person' }, 'Talk to a person');
    const g = s.memory.offered?.[Number(d) - 1];
    if (!g) {
      say({ role: 'agent', kind: 'text', text: 'Sorry, that isn’t one of the options. You can say your question, or press 0 for a person.' });
      setExchange({ outcome: 'generic' });
      return;
    }
    input = { type: 'pick_grant', grantId: g, label: '' };
  }

  // Understand: route to an agent and toolset.
  let c: Classification;
  if (input.type === 'pick_grant') {
    const intent = s.memory.pendingIntent ?? 'status';
    c = { ...classify(intentPhrase(intent), donorGrants), intent, grantRef: input.grantId, confidence: 1, domain: 'grants' };
  } else {
    c = classify(userText, donorGrants);
    // A caller answering "which grant?" by name.
    if (c.grantRef && c.intent === 'unknown' && s.memory.pendingIntent) c = { ...c, intent: s.memory.pendingIntent, toolset: classify(intentPhrase(s.memory.pendingIntent), donorGrants).toolset, domain: 'grants' };
    if (!c.grantRef && !c.wantsOther && isFollowUp(c.intent) && s.memory.currentGrantId) c = { ...c, grantRef: s.memory.currentGrantId };
  }
  setExchange({ routing: routing(c) });

  // 5. Answer, generic reply, or hand-off -----------------------------------
  switch (c.intent) {
    case 'greeting':
      say({ role: 'agent', kind: 'text', text: 'Hi! I can check on any of your grants. Which one would you like to know about?' });
      store.set({ suggestions: DEFAULT_SUGGESTIONS });
      return remember({ lastIntent: c.intent });
    case 'thanks':
      say({ role: 'agent', kind: 'text', text: isVoice() ? 'You’re welcome. Is there anything else about your grants? If not, you can hang up.' : 'You’re welcome. Anything else about your grants?' });
      store.set({ suggestions: chips('Show all my grants', 'Where’s my grant?') });
      return remember({ lastIntent: c.intent });
    case 'unknown':
      say({ role: 'agent', kind: 'text', text: 'I’m not sure I followed. I can help with grants on your account, like where a grant is, why it’s pending, or when the charity gets paid.' });
      setExchange({ outcome: 'generic' });
      store.set({ suggestions: DEFAULT_SUGGESTIONS });
      return remember({ lastIntent: c.intent });
    case 'out_of_scope': {
      const d = FUTURE_DOMAINS.find((x) => x.key === c.domain);
      say({
        role: 'agent', kind: 'text',
        text: `That’s outside what I can help with here. Right now I only answer questions about grants on your account: status, reviews and payments.${d ? ` For questions about ${d.reply}, I can connect you with a person.` : ' I can connect you with a person for anything else.'}`,
      });
      setExchange({ outcome: 'generic' });
      store.set({ suggestions: chips('Talk to a person', 'Show all my grants') });
      return remember({ lastIntent: c.intent });
    }
    case 'submission':
      say({ role: 'agent', kind: 'text', text: `I can’t start, change or cancel grants ${isVoice() ? 'on this line' : 'in this chat'} yet. I can tell you where an existing grant is, or connect you with a person who can help.` });
      setExchange({ outcome: 'generic' });
      store.set({ suggestions: chips('Talk to a person', 'Show all my grants') });
      return remember({ lastIntent: c.intent });
    case 'policy': {
      const passages = await searchKnowledgeBase(ctx, userText);
      if (!passages.length) {
        say({ role: 'agent', kind: 'text', text: 'I don’t have approved information on that. A specialist can help.' });
        setExchange({ outcome: 'generic' });
        store.set({ suggestions: chips('Talk to a person') });
      } else {
        passages.forEach((p) => addSource(`${p.title} › ${p.section}`));
        say({ role: 'agent', kind: 'kb_answer', text: passages[0].text, passages });
        store.set({ suggestions: chips('Where’s my grant?', 'Can this be sped up?', 'Talk to a person') });
      }
      return remember({ lastIntent: c.intent });
    }
    case 'human':
      await handOff(ctx, 'Grant Status Inquiry', 'Donor asked for a person');
      return remember({ lastIntent: c.intent });
    case 'list': {
      if (!(await accountActive(ctx))) return;
      const all = await listGrants(ctx, donor.donor_id);
      allow(`Listed only ${donor.donor_id}’s grants`);
      addSource(`Grant records for ${donor.donor_id}`);
      say({ role: 'agent', kind: 'grant_picker', prompt: `You have ${all.length} grants.${isVoice() ? '' : ' Tap one for details.'}`, grants: all.map(pick) });
      store.set({ suggestions: pickChips(all) });
      return remember({ lastIntent: c.intent, pendingIntent: 'status', offered: all.map((g) => g.grant_id) });
    }
    default:
      return grantFlow(ctx, c.intent, c.grantRef);
  }
}

function routing(c: Classification): Exchange['routing'] {
  if (c.intent === 'human') return { intent: c.intent, agent: 'Hand-off to a person', live: true };
  if (c.intent === 'out_of_scope') {
    const d = FUTURE_DOMAINS.find((x) => x.key === c.domain);
    return { intent: c.intent, agent: d ? `${d.label} agent (future)` : 'Outside grants', live: false };
  }
  const live = TOOLSETS.find((t) => t.key === c.toolset)?.live ?? true;
  return { intent: c.intent, agent: 'Grants agent', toolset: c.toolset ? toolsetLabel(c.toolset) : undefined, live };
}

function intentPhrase(i: Intent) {
  return ({ why_pending: 'why pending', expedite: 'speed up', payment: 'paid', declined: 'declined' } as Partial<Record<Intent, string>>)[i] ?? 'status';
}

function isFollowUp(i: Intent) {
  return ['why_pending', 'expedite', 'payment', 'declined', 'status'].includes(i);
}

function pick(g: Grant) {
  const { label, tone } = statusLabel(g.grant_status, dueDiligence.find((d) => d.grant_id === g.grant_id));
  return { grant: g, statusLabel: label, tone };
}

/** On a call the caller can also just say the charity's name. */
function pickChips(list: Grant[]): Chip[] {
  return isVoice() ? list.slice(0, 4).map((g) => ({ label: g.grantee_name, input: { type: 'text', text: g.grantee_name } })) : chips('Talk to a person');
}

// ------------------------------------------------------------------ 3. authentication

async function authenticate(ctx: ToolCtx, input: TurnInput, userText: string) {
  const s = store.get();
  const voice = isVoice();
  setExchange({ outcome: 'sign_in' });
  const c = classify(input.type === 'text' ? userText : '', []);
  const noId = input.type === 'text' && NO_ID.test(userText);

  // Anyone can ask for a person, verified or not. The rep verifies them.
  if (input.type === 'text' && c.intent === 'human') {
    const why = s.auth.locked ? 'Could not verify identity' : s.auth.guest ? 'Unverified donor asked for a person' : voice ? 'Caller asked for a person before verifying' : 'Visitor asked for a person before signing in';
    await handOff(ctx, 'Grant Status Inquiry', why);
    return;
  }

  // Voice, step 2 of 2: the PIN.
  if (voice && s.auth.candidateId) {
    if (noId) return enterGuest();
    const digits = (input.type === 'keypad' ? input.digits : input.type === 'text' ? input.text : '').replace(/\D/g, '');
    if (digits.length !== 4) {
      say({ role: 'agent', kind: 'text', text: 'Please enter your four-digit PIN on the keypad. If you don’t know it, just say so.' });
      return;
    }
    const ok = await verifyCaller(ctx, s.auth.candidateId, digits);
    if (!ok) return failedAttempt('That PIN didn’t match. Please enter it again.');
    return verified(ctx, s.auth.candidateId);
  }

  // Step 1: the donor ID. Chat: "D-01". Voice: "01#" on the keypad (or said out loud).
  const text = input.type === 'text' ? userText : input.type === 'keypad' ? input.digits : '';
  const m = text.match(DONOR_ID) ?? (voice || input.type === 'keypad' ? text.match(/^\D*(\d{1,2})\s*#?\s*$/) : null);
  if (m) {
    if (s.auth.locked) {
      say({ role: 'agent', kind: 'text', text: 'For your security I can’t try verifying again in this conversation. You can still ask general questions, or I can connect you with a person who can verify you.' });
      store.set({ suggestions: guestChips() });
      return;
    }
    const id = `D-${m[1].padStart(2, '0')}`;
    const donor = await getDonorProfile(ctx, id);
    if (!donor) return failedAttempt(voice ? 'I couldn’t find that donor ID. Please enter it again, then press pound.' : `I couldn’t find donor ID ${id}. Please check it and try again.`);
    if (voice) {
      store.set((st) => ({ auth: { ...st.auth, candidateId: id } }));
      say({ role: 'agent', kind: 'text', text: 'Thanks. For your security, enter your four-digit PIN.' });
      return;
    }
    return verified(ctx, id);
  }

  if (noId) return enterGuest();

  if (input.type === 'text' && /^(verify|sign in|log in)\b/i.test(userText.trim())) {
    say({ role: 'agent', kind: 'text', text: voice ? 'Sure. Enter your donor ID on your keypad, then press pound.' : 'Sure. Please enter your donor ID.' });
    store.set({ suggestions: voice ? [] : SIGN_IN_SUGGESTIONS });
    return;
  }

  // Not verified, by choice or after too many tries: general questions only.
  if (s.auth.guest || s.auth.locked) return guestTurn(ctx, userText, c);

  // A question before verifying: keep it, ask for the ID, answer it right after (or offer the guest route).
  say({
    role: 'agent', kind: 'text',
    text: voice
      ? 'I can help with that. First, enter your donor ID on your keypad, then press pound. If you don’t know it, just say so.'
      : 'I can help with that. First, please enter your donor ID so I only show grants on your account. If you don’t have it, I can still answer general questions.',
  });
  store.set({ suggestions: voice ? VOICE_SIGN_IN_SUGGESTIONS : SIGN_IN_SUGGESTIONS });
  if (input.type === 'text') remember({ pendingQuestion: userText });
}

// ------------------------------------------------------------------ not-verified donor (guest)

function guestChips(): Chip[] {
  const locked = store.get().auth.locked;
  return chips('What is due diligence?', 'How long does a grant review take?', 'How are approved grants paid?', ...(locked ? [] : ['Verify with my donor ID']), 'Talk to a person');
}

/** The donor can't or won't verify: carry on with general questions only. */
function enterGuest() {
  const voice = isVoice();
  store.set((st) => ({ auth: { ...st.auth, guest: true, candidateId: undefined } }));
  setExchange({
    authentication: authNow(),
    authorization: { status: 'limited', detail: 'Not verified → general grant information only, no account data' },
  });
  say({
    role: 'agent', kind: 'text',
    text: voice
      ? 'No problem. Without verifying, I can answer general questions about how grants work, like what a charity review is or how grants are paid. I can’t discuss your grants until you’re verified. You can enter your donor ID at any time, or ask for a person who can verify you.'
      : 'No problem. Without signing in, I can answer general questions about how grants work, like what due diligence is or how grants are paid. I can’t look up your grants until you’re verified. You can enter your donor ID at any time, or talk to a person who can verify you.',
  });
  store.set({ suggestions: guestChips() });
}

async function guestTurn(ctx: ToolCtx, userText: string, c: Classification) {
  const voice = isVoice();
  setExchange({ routing: routing(c), outcome: 'generic' });
  const accountSpecific = !!c.grantRef || /\b(my|mine|our)\b/i.test(userText) || ['list', 'status'].includes(c.intent);
  const general = ['policy', 'why_pending', 'payment', 'expedite', 'declined'].includes(c.intent);

  if (c.intent === 'out_of_scope' || c.intent === 'submission') {
    say({ role: 'agent', kind: 'text', text: 'That’s outside what I can help with here. I can answer general questions about grants, or connect you with a person.' });
    store.set({ suggestions: guestChips() });
    return;
  }
  if (accountSpecific && (general || c.intent === 'status' || c.intent === 'list')) {
    block('Not verified → no account data');
    say({
      role: 'agent', kind: 'text',
      text: store.get().auth.locked
        ? 'I can’t look up your grants because I couldn’t verify you. A person can verify you and help with your grants.'
        : voice
          ? 'I can’t look up your grants until you’re verified. Enter your donor ID on your keypad, then press pound, or ask for a person who can verify you.'
          : 'I can’t look up your grants until you’re verified. Enter your donor ID to verify, or talk to a person who can verify you and help.',
    });
    store.set({ suggestions: guestChips() });
    remember({ pendingQuestion: userText });
    return;
  }
  if (general) {
    const passages = await searchKnowledgeBase(ctx, userText);
    if (passages.length) {
      setExchange({ outcome: 'answered', authorization: { status: 'limited', detail: 'General grant information only (no account data)' } });
      passages.forEach((p) => addSource(`${p.title} › ${p.section}`));
      say({ role: 'agent', kind: 'kb_answer', text: passages[0].text, passages });
      store.set({ suggestions: guestChips() });
      return;
    }
  }
  say({ role: 'agent', kind: 'text', text: `I can answer general questions about how grants work${store.get().auth.locked ? '' : ', or look up your grants once you’re verified'}. A person can help with anything else.` });
  store.set({ suggestions: guestChips() });
}

function failedAttempt(retryText: string) {
  const s = store.get();
  const attempts = s.auth.attempts + 1;
  const locked = attempts >= MAX_ATTEMPTS;
  store.set({ auth: { ...s.auth, attempts, locked, candidateId: locked ? undefined : s.auth.candidateId } });
  setExchange({ authentication: authNow() });
  if (locked) {
    setExchange({ authorization: { status: 'limited', detail: 'Not verified → general grant information only, no account data' } });
    say({ role: 'agent', kind: 'notice', tone: 'warn', title: 'I couldn’t verify your identity', body: 'For your security I’ve stopped trying. You can still ask general questions about grants, or I can connect you with a person who can verify you.' });
    store.set({ suggestions: guestChips() });
  } else {
    say({ role: 'agent', kind: 'text', text: retryText });
    store.set({ suggestions: isVoice() ? VOICE_SIGN_IN_SUGGESTIONS : SIGN_IN_SUGGESTIONS });
  }
}

async function verified(ctx: ToolCtx, id: string) {
  const s = store.get();
  const donor = demoDonors().find((d) => d.donor.donor_id === id)!.donor;
  store.set({ auth: { donorId: id, attempts: 0, locked: false, guest: false } });
  setExchange({ authentication: authNow() });
  allow(`Session limited to grants on ${id}`);
  const first = donor.primary_contact_name.split(' ')[0];
  say({
    role: 'agent', kind: 'text',
    text: isVoice()
      ? `Thanks, ${first}. You’re verified for the ${donor.account_name}. I can only discuss grants on this account.`
      : `Thanks, ${first}. You’re signed in to ${donor.account_name}. I’ll only show grants on this account.`,
  });

  const pending = s.memory.pendingQuestion;
  remember({ pendingQuestion: undefined });
  if (pending) return handle(ctx, { type: 'text', text: pending }, pending);
  say({ role: 'agent', kind: 'text', text: isVoice() ? 'What would you like to know about your grants?' : 'What would you like to know?' });
  setExchange({ outcome: 'sign_in' });
  store.set({ suggestions: DEFAULT_SUGGESTIONS });
}

// ------------------------------------------------------------------ 4. authorization + grants agent

async function accountActive(ctx: ToolCtx): Promise<boolean> {
  const donor = await getDonorProfile(ctx, store.get().auth.donorId!);
  if (donor && donor.account_status !== 'ACTIVE') {
    block(`Account ${donor.account_status.toLowerCase()} → no self-service`);
    say({
      role: 'agent', kind: 'notice', tone: 'warn', title: `Your account is ${donor.account_status.toLowerCase()}`,
      body: 'I can’t share grant details while the account isn’t active. Our Donor Services team can help.',
    });
    setExchange({ outcome: 'generic' });
    store.set({ suggestions: chips('Talk to a person') });
    return false;
  }
  return true;
}

async function grantFlow(ctx: ToolCtx, intent: Intent, grantRef: string | undefined) {
  const s = store.get();
  const donorId = s.auth.donorId!;
  if (!(await accountActive(ctx))) return;

  // A grant that isn't on this donor's account is never looked up.
  if (grantRef && !grants.some((g) => g.grant_id === grantRef && g.donor_id === donorId)) {
    block(`${grantRef} is not on ${donorId}’s account → not looked up`);
    say({ role: 'agent', kind: 'text', text: `I can only share grants on your account, and I don’t see ${grantRef} there. Would you like to hear the grants you have?` });
    setExchange({ outcome: 'generic' });
    store.set({ suggestions: chips('Show all my grants', 'Talk to a person') });
    return remember({ lastIntent: intent });
  }

  let grantId = grantRef;
  if (!grantId) {
    const all = await listGrants(ctx, donorId);
    allow(`Searched only ${donorId}’s grants`);
    const filter: Record<string, (g: Grant) => boolean> = {
      why_pending: (g) => g.grant_status === 'PENDING_DD',
      expedite: (g) => g.grant_status === 'PENDING_DD',
      payment: (g) => ['APPROVED', 'FUNDED'].includes(g.grant_status),
      declined: (g) => g.grant_status === 'DENIED',
      status: (g) => g.grant_status !== 'CLOSED',
    };
    let candidates = all.filter(filter[intent] ?? (() => true));
    const noun = intent === 'why_pending' || intent === 'expedite' ? 'pending' : intent === 'payment' ? 'approved or paid' : intent === 'declined' ? 'declined' : 'open';
    if (candidates.length === 1) {
      grantId = candidates[0].grant_id;
    } else {
      let prompt = `You have ${candidates.length} ${noun} grants. Which one?`;
      if (!candidates.length) { prompt = `I don’t see any ${noun} grants. Here are all of your grants.`; candidates = all; }
      say({ role: 'agent', kind: 'grant_picker', prompt, grants: candidates.map(pick) });
      store.set({ suggestions: pickChips(candidates) });
      return remember({ lastIntent: intent, pendingIntent: intent, offered: candidates.map((g) => g.grant_id) });
    }
  }

  const bundle = await getGrantStatus(ctx, grantId);
  if (!bundle.grant) {
    say({ role: 'agent', kind: 'text', text: `I couldn’t find grant ${grantId} on your account.` });
    store.set({ suggestions: chips('Show all my grants') });
    return remember({ lastIntent: intent });
  }
  allow(`${grantId} belongs to ${donorId}`);
  addSource(`Grant record ${grantId}`);
  let dd: DueDiligence | undefined;
  if (bundle.grant.grant_status === 'PENDING_DD') { dd = await checkDueDiligence(ctx, grantId); addSource(`Due diligence review ${grantId}`); }

  const sens = sensitivity(bundle.grantee, dd);
  const view: GrantStatusView = buildStatusView(bundle, dd);
  // "Can this be sped up?" right after hearing the status: don't repeat it, go straight to the answer.
  const alreadyShown = intent === 'expedite' && s.memory.currentGrantId === grantId && !view.withheld;
  const wantsPolicy = !alreadyShown && !view.withheld && (intent === 'why_pending' || intent === 'payment' || (view.tone === 'review' && intent === 'status'));
  const msgId = alreadyShown ? '' : say({ role: 'agent', kind: 'grant_status', view: { ...view, policyLoading: wantsPolicy } });

  if (wantsPolicy) {
    const q = intent === 'payment' || view.tone !== 'review' ? 'payment wire paid' : 'why pending due diligence review';
    const passages = await searchKnowledgeBase(ctx, q);
    passages.forEach((p) => addSource(`${p.title} › ${p.section}`));
    patchMessage(msgId, (m) => (m.role === 'agent' && m.kind === 'grant_status' ? { ...m, view: { ...m.view, citations: passages, policyLoading: false } } : m));
  }

  remember({ currentGrantId: grantId, lastIntent: intent, pendingIntent: undefined, offered: undefined });

  if (view.withheld) {
    await handOff(ctx, 'Due Diligence Question', `Compliance-sensitive review (${sens})`);
    return;
  }
  if (intent === 'expedite') {
    if (view.tone === 'review') {
      say({ role: 'agent', kind: 'text', text: 'I can’t change the review timeline. It’s a required check before any grant is paid. A specialist can look at it with you.' });
      await handOff(ctx, 'Due Diligence Question', 'Asked to expedite a grant in review');
      return;
    }
    say({ role: 'agent', kind: 'text', text: 'This grant is already past review, so there’s nothing to speed up. If something looks wrong, I can connect you with a person.' });
  }
  store.set({ suggestions: suggestionsFor(view) });
}

function suggestionsFor(v: GrantStatusView): Chip[] {
  if (v.tone === 'review') return chips('What is due diligence?', 'Can this be sped up?', 'Talk to a person');
  if (v.tone === 'approved') return chips('When will the charity get paid?', 'Show all my grants', 'Talk to a person');
  if (v.tone === 'declined') return chips('Talk to a person', 'Show all my grants');
  return chips('Show all my grants', 'Talk to a person');
}

// ------------------------------------------------------------------ hand-off

async function handOff(ctx: ToolCtx, caseTypeName: string, reason: string) {
  const voice = isVoice();
  const s = store.get();
  const donor = currentDonor();
  const { caseId, caseType } = await createServiceRequest(ctx, caseTypeName);
  await readQueue(ctx, caseType.escalation_team);
  const mode = voice ? 'transfer' : 'case';
  const handoff = { caseId, team: caseType.escalation_team, responseHours: caseType.sla_hours, mode } as const;
  setExchange({ outcome: 'handoff', handoff });
  say({ role: 'agent', kind: 'handoff', caseId, team: caseType.escalation_team, responseHours: caseType.sla_hours, reason, mode });

  // The case the rep sees: built only from the redacted conversation (no PII, no PIN).
  const snapshot = lastStatusView();
  const g = snapshot?.grant ?? (s.memory.currentGrantId ? grants.find((x) => x.grant_id === s.memory.currentGrantId) : undefined);
  const words = s.exchange?.question ?? '';
  const who = donor ? `${donor.primary_contact_name} (${donor.account_name})` : voice ? 'An unverified caller' : 'An unverified visitor';
  const parts = [`${who} ${voice ? 'called the grants line' : 'used the chat'} and said: “${words}”.`];
  if (g && snapshot) parts.push(`Grant ${g.grant_id} for ${fmtMoney(g.grant_amount_usd)} to ${g.grantee_name} is ${snapshot.statusLabel.toLowerCase()}. ${snapshot.facts.filter((f) => f.label !== 'Submitted').map((f) => `${f.label}: ${f.value}`).join('; ')}.`);
  if (!donor) parts.push(s.auth.locked ? `Verification failed ${MAX_ATTEMPTS} times.` : s.auth.guest ? 'They chose to continue without verifying, so no account details were shared.' : 'They had not verified yet.');
  parts.push(`Handed off by the assistant: ${reason}.${voice ? ' The call was transferred to you.' : ''}`);
  const speaker = voice ? 'Caller' : 'Donor';
  const rec: CaseRecord = {
    id: caseId,
    channel: s.channel,
    mode,
    donorId: donor?.donor_id ?? 'unverified',
    donorName: donor?.primary_contact_name ?? (voice ? 'Unverified caller' : 'Unverified visitor'),
    accountName: donor?.account_name ?? 'Not verified',
    verified: !!donor,
    grantId: g?.grant_id,
    caseTypeId: caseType.case_type_id,
    caseType: caseType.case_type_name,
    team: caseType.escalation_team,
    slaHours: caseType.sla_hours,
    createdAt: now(),
    createdByAgent: true,
    reason,
    donorWords: words,
    summary: parts.join(' '),
    nextStep: nextStepFor(reason, snapshot, !!donor, voice),
    transcript: store.get().messages.map((m) => ({ who: m.role === 'user' ? speaker : 'Assistant', text: voice ? toSpeech(m) : messageToText(m) })),
    grantSnapshot: snapshot,
    status: 'open',
    replies: [],
    live: true,
  };
  store.set((st) => ({ cases: [rec, ...st.cases], repSelected: caseId, suggestions: [] }));
  if (voice) {
    store.set({ call: 'transferring' });
    setTimeout(() => { if (store.get().call === 'transferring') store.set({ call: 'transferred' }); }, 2500);
  }
}

function lastStatusView(): GrantStatusView | undefined {
  const msgs = store.get().messages;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'agent' && m.kind === 'grant_status') return m.view;
  }
  return undefined;
}

function nextStepFor(reason: string, v: GrantStatusView | undefined, verified: boolean, voice: boolean) {
  if (!verified) return voice ? 'Verify the caller’s identity before discussing any grant' : 'Verify the visitor’s identity before discussing any grant';
  if (/expedite/i.test(reason)) return 'Check the review’s progress and give the donor a realistic date';
  if (/Compliance/i.test(reason)) return 'Compliance to review before any donor contact';
  if (v?.overdue) return 'Find out why the review is past its estimate';
  if (v?.tone === 'declined') return 'Review the decline notes and explain options to the donor';
  return voice ? 'Pick up the transferred call and answer the question' : 'Contact the donor and answer their question';
}
