// Supervising orchestrator: understand → reason → act → remember.
// Mirrors the Bedrock orchestrator + Grants specialist skill. Everything the donor sees is built from
// tool output; anything the agent can't ground or isn't allowed to say goes to a human with full context.

import { demoDonors, dueDiligence, grants } from '../data/load';
import type { DueDiligence, Grant } from '../data/types';
import {
  appendTask, DEFAULT_SUGGESTIONS, store, uid,
  type Chip, type Memory, type TurnInput,
} from '../state/store';
import { fmtMoney, now } from './clock';
import { classify, type Intent } from './intent';
import { buildStatusView, PUBLIC_REASON, sensitivity, statusLabel } from './policy';
import {
  AllSourcesDown, checkDueDiligence, createServiceRequest, getDonorProfile, getGrantStatus,
  listGrants, readQueue, scheduleFollowUp, searchKnowledgeBase, type ToolCtx,
} from './tools';
import type { AgentMessage, CaseRecord, GrantStatusView, Phase, TraceKind } from './types';

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewMessage = DistOmit<AgentMessage, 'id'>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeCtx(turn: number): ToolCtx {
  const s = store.get();
  return {
    scenario: s.scenario,
    step(phase: Phase, kind: TraceKind, label: string, detail: string, sql?: string) {
      const id = uid('t');
      const started = performance.now();
      store.set((st) => ({ trace: [...st.trace, { id, turn, phase, kind, label, detail, sql, status: 'running' }] }));
      return {
        finish(status, d, ms) {
          store.set((st) => ({
            trace: st.trace.map((e) => (e.id === id
              ? { ...e, status, detail: d ?? e.detail, ms: ms ?? Math.round(performance.now() - started) }
              : e)),
          }));
        },
      };
    },
    audit: (t) => appendTask(t),
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

function remember(ctx: ToolCtx, patch: Partial<Memory>) {
  const memory = { ...store.get().memory, ...patch };
  store.set({ memory });
  const h = ctx.step('remember', 'memory', 'Session memory',
    [memory.currentGrantId && `grant ${memory.currentGrantId}`, memory.lastIntent && `last intent ${memory.lastIntent}`, memory.openCaseId && `open case ${memory.openCaseId}`]
      .filter(Boolean).join(' · ') || 'nothing to keep');
  h.finish('ok', undefined, 2);
}

const chips = (...labels: string[]): Chip[] => labels.map((label) => ({ label, input: { type: 'text', text: label } }));

export function messageToText(m: AgentMessage): string {
  if (m.role === 'user') return m.text;
  switch (m.kind) {
    case 'text': return m.text;
    case 'grant_picker': return `[Grant list] ${m.prompt}`;
    case 'grant_status': return `[Grant status card] ${m.view.statusLabel}. ${m.view.explanation}`;
    case 'kb_answer': return `${m.text} [Cited: ${m.passages.map((p) => p.section).join('; ')}]`;
    case 'notice': return `[${m.title}] ${m.body}`;
    case 'escalation': return `[Case created] ${m.caseId}`;
    case 'callback': return `[Callback options] ${m.slots.map((s) => s.label).join(' / ')}`;
    case 'callback_confirmed': return `[Callback booked] ${m.slot}`;
  }
}

// ------------------------------------------------------------------ entry point

export async function runTurn(input: TurnInput) {
  const s0 = store.get();
  if (s0.busy) return;
  const turn = s0.turn + 1;
  const userText = input.type === 'text' ? input.text : input.type === 'pick_grant' ? input.label : `Call me ${input.slot}`;
  store.set((s) => ({
    busy: true, turn, suggestions: [],
    messages: [...s.messages, { id: uid('m'), role: 'user', text: userText }],
  }));
  const ctx = makeCtx(turn);
  try {
    await handle(ctx, input, userText);
  } catch (err) {
    console.error(err);
    say({ role: 'agent', kind: 'notice', tone: 'error', title: 'Something went wrong', body: 'I couldn’t finish that. You can try again or talk to someone.' });
    store.set({ suggestions: chips('Talk to a person') });
  } finally {
    store.set({ busy: false });
  }
}

async function handle(ctx: ToolCtx, input: TurnInput, userText: string) {
  const s = store.get();
  const donor = demoDonors().find((d) => d.donor.donor_id === s.donorId)!.donor;
  const donorGrants = grants.filter((g) => g.donor_id === donor.donor_id);

  // UNDERSTAND --------------------------------------------------------------
  const a = ctx.step('understand', 'auth', 'Session check', `Donor Authentication Platform · ${donor.donor_id} · role: ${roleName(s.role)}`);
  await sleep(30);
  a.finish('ok', undefined, 28);

  if (input.type === 'slot') return bookCallback(ctx, input.caseId, input.slot, input.messageId, donor.donor_id);

  let intent: Intent;
  let grantRef: string | undefined;
  if (input.type === 'pick_grant') {
    intent = s.memory.pendingIntent ?? 'status';
    grantRef = input.grantId;
    const h = ctx.step('understand', 'intent', `Selection · ${intent}`, `donor picked ${input.grantId} (continuing earlier request)`);
    h.finish('ok', undefined, 3);
  } else {
    const h = ctx.step('understand', 'intent', 'Intent', 'Bedrock orchestrator · classifying…');
    await sleep(180 + Math.random() * 80);
    const c = classify(input.text, donorGrants);
    intent = c.intent;
    grantRef = c.grantRef ?? (!c.wantsOther && isFollowUp(intent) ? s.memory.currentGrantId : undefined);
    h.finish(c.confidence < 0.6 ? 'warn' : 'ok',
      `${c.intent} · confidence ${c.confidence.toFixed(2)}${c.grantRef ? ` · grant ${c.grantRef}` : grantRef ? ` · grant ${grantRef} (from memory)` : ''} → ${routeFor(c.intent)}`);
  }

  // REASON + ACT ------------------------------------------------------------
  switch (intent) {
    case 'greeting':
      say({ role: 'agent', kind: 'text', text: `Hi! I can check on any of your grants. Which one would you like to know about?` });
      store.set({ suggestions: DEFAULT_SUGGESTIONS });
      return remember(ctx, { lastIntent: intent });
    case 'thanks':
      say({ role: 'agent', kind: 'text', text: 'You’re welcome. Anything else about your grants?' });
      store.set({ suggestions: chips('Show all my grants', 'Where’s my grant?') });
      return remember(ctx, { lastIntent: intent });
    case 'unknown': {
      const g = ctx.step('reason', 'guard', 'Low confidence', 'ask a clarifying question instead of guessing');
      g.finish('warn', undefined, 1);
      say({ role: 'agent', kind: 'text', text: 'I’m not sure I followed. I can help with grant questions, like where a grant is, why it’s pending, or when the charity gets paid.' });
      store.set({ suggestions: DEFAULT_SUGGESTIONS });
      return remember(ctx, { lastIntent: intent });
    }
    case 'out_of_scope': {
      const g = ctx.step('reason', 'guard', 'Scope check', 'not a grants question → DAF / Transactions agent (future phase) → offer a person');
      g.finish('warn', undefined, 2);
      say({ role: 'agent', kind: 'text', text: 'I can only help with grant questions right now. Questions about contributions, balances and statements are coming soon. In the meantime, I can connect you with a person.' });
      store.set({ suggestions: chips('Talk to a person', 'Show all my grants') });
      return remember(ctx, { lastIntent: intent });
    }
    case 'policy': {
      const passages = await searchKnowledgeBase(ctx, userText, { donor_id: donor.donor_id });
      groundingCheck(ctx, passages.length > 0 ? 'answer uses retrieved policy passages only' : 'no passage found → no answer');
      if (!passages.length) {
        say({ role: 'agent', kind: 'text', text: 'I don’t have approved information on that. A specialist can help.' });
        store.set({ suggestions: chips('Talk to a person') });
      } else {
        say({ role: 'agent', kind: 'kb_answer', text: passages[0].text, passages });
        store.set({ suggestions: chips('Where’s my grant?', 'Can this be sped up?', 'Talk to a person') });
      }
      return remember(ctx, { lastIntent: intent });
    }
    case 'human':
      await escalate(ctx, {
        caseType: s.memory.currentGrantId ? 'Grant Status Inquiry' : 'Grant Status Inquiry',
        reason: 'Donor asked for a person', donorWords: userText, intro: 'Of course. I’ve shared this conversation with our team so you won’t need to repeat yourself.',
      });
      return remember(ctx, { lastIntent: intent });
    case 'list': {
      if (!(await authorized(ctx))) return;
      let all: Grant[];
      try { all = await listGrants(ctx, donor.donor_id); } catch (e) { return allDown(ctx, e, userText); }
      say({ role: 'agent', kind: 'grant_picker', prompt: `You have ${all.length} grants. Tap one for details.`, grants: all.map(pick) });
      store.set({ suggestions: chips('Talk to a person') });
      return remember(ctx, { lastIntent: intent, pendingIntent: 'status' });
    }
    default:
      return grantFlow(ctx, intent, grantRef, userText);
  }
}

function isFollowUp(i: Intent) {
  return ['why_pending', 'expedite', 'payment', 'declined', 'status'].includes(i);
}

function routeFor(i: Intent) {
  if (['status', 'why_pending', 'payment', 'declined', 'expedite', 'list', 'policy'].includes(i)) return 'Grants agent';
  if (i === 'human') return 'Escalation';
  if (i === 'out_of_scope') return 'no agent in scope';
  return 'Orchestrator';
}

function roleName(r: string) {
  return r === 'holder' ? 'account holder' : r === 'advisor' ? 'advisor' : 'family member';
}

function pick(g: Grant) {
  const { label, tone } = statusLabel(g.grant_status, dueDiligence.find((d) => d.grant_id === g.grant_id));
  return { grant: g, statusLabel: label, tone };
}

function groundingCheck(ctx: ToolCtx, detail: string) {
  const h = ctx.step('reason', 'guard', 'Grounding check', detail);
  h.finish('ok', undefined, 12);
}

async function authorized(ctx: ToolCtx): Promise<boolean> {
  const s = store.get();
  const h = ctx.step('reason', 'guard', 'Authorization', `role: ${roleName(s.role)} · scope grants:read`);
  await sleep(10);
  if (s.role === 'family') {
    h.finish('fail', `role: family member · no grants:read scope → details withheld`, 9);
    say({
      role: 'agent', kind: 'notice', tone: 'lock', title: 'You don’t have access to grant details',
      body: 'Grant details are visible to the account holder and people they’ve given access to. Ask the account holder to update your access, or I can connect you with our team.',
    });
    store.set({ suggestions: chips('Talk to a person') });
    remember(ctx, {});
    return false;
  }
  h.finish('ok', s.role === 'advisor' ? 'role: advisor → status visible, amounts masked' : 'role: account holder → full access', 9);
  return true;
}

async function allDown(ctx: ToolCtx, err: unknown, userText: string) {
  if (!(err instanceof AllSourcesDown)) throw err;
  const h = ctx.step('reason', 'guard', 'Fallback exhausted', 'gold → Gemini DB → Grant System API all failed → HITL (don’t guess)');
  h.finish('fail', undefined, 1);
  say({
    role: 'agent', kind: 'notice', tone: 'error', title: 'I can’t reach our grant systems right now',
    body: 'I won’t guess about your grant. I’ve passed your question to our team so a person can check it directly.',
  });
  await escalate(ctx, { caseType: 'Grant Status Inquiry', reason: 'Grant data unavailable: all sources down', donorWords: userText });
}

// ------------------------------------------------------------------ grant flow

async function grantFlow(ctx: ToolCtx, intent: Intent, grantRef: string | undefined, userText: string) {
  const s = store.get();
  if (!(await authorized(ctx))) return;

  // Account must be active before we discuss grants.
  let donor;
  try { donor = await getDonorProfile(ctx, s.donorId); } catch (e) { return allDown(ctx, e, userText); }
  if (donor && donor.account_status !== 'ACTIVE') {
    const g = ctx.step('reason', 'guard', 'Account status', `${donor.account_status} → no self-service, route to Donor Services`);
    g.finish('warn', undefined, 2);
    say({
      role: 'agent', kind: 'notice', tone: 'warn', title: `Your account is ${donor.account_status.toLowerCase()}`,
      body: 'I can’t share grant details while the account isn’t active. Our Donor Services team can help.',
    });
    store.set({ suggestions: chips('Talk to a person') });
    return remember(ctx, { lastIntent: intent });
  }

  // Resolve which grant.
  let grantId = grantRef;
  if (!grantId) {
    let all: Grant[];
    try { all = await listGrants(ctx, s.donorId); } catch (e) { return allDown(ctx, e, userText); }
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
      store.set({ suggestions: chips('Talk to a person') });
      return remember(ctx, { lastIntent: intent, pendingIntent: intent });
    }
  }

  // Fetch status (+ due diligence when in review).
  let bundle;
  try { bundle = await getGrantStatus(ctx, grantId); } catch (e) { return allDown(ctx, e, userText); }
  if (!bundle.grant) {
    say({ role: 'agent', kind: 'text', text: `I couldn’t find grant ${grantId} on your account.` });
    store.set({ suggestions: chips('Show all my grants') });
    return remember(ctx, { lastIntent: intent });
  }
  let dd: DueDiligence | undefined;
  let ddSource = '';
  if (bundle.grant.grant_status === 'PENDING_DD') {
    try {
      const r = await checkDueDiligence(ctx, grantId, s.donorId);
      dd = r.dd; ddSource = r.source;
    } catch (e) { return allDown(ctx, e, userText); }
  }

  // Guardrails.
  const sens = sensitivity(bundle.grantee, dd);
  if (sens) {
    const g = ctx.step('reason', 'guard', 'Compliance guardrail', `${sens} → detail withheld from self-service`);
    g.finish('warn', undefined, 3);
  }
  if (dd?.escalation_flag && !PUBLIC_REASON[dd.escalation_reason] && !sens) {
    const g = ctx.step('reason', 'guard', 'Internal flag', `“${dd.escalation_reason}” is internal-only → not shown`);
    g.finish('ok', undefined, 1);
  }
  const masked = ctx.step('reason', 'guard', 'PII masking', 'review_notes masked · grantee_name served from masked view');
  masked.finish('ok', undefined, 2);

  const view: GrantStatusView = { ...buildStatusView(bundle, s.role, dd), sources: [bundle.source, ...(ddSource ? [ddSource] : [])] };
  groundingCheck(ctx, 'every date, amount and reason traced to tool output');
  const wantsPolicy = !view.withheld && (intent === 'why_pending' || intent === 'payment' || (view.tone === 'review' && intent === 'status'));
  const msgId = say({ role: 'agent', kind: 'grant_status', view: { ...view, policyLoading: wantsPolicy } });

  if (wantsPolicy) {
    const reasonKw = dd?.escalation_flag ? PUBLIC_REASON[dd.escalation_reason]?.kb ?? '' : '';
    const q = intent === 'payment' || view.tone !== 'review' ? 'payment wire paid' : `why pending due diligence review ${reasonKw}`;
    const passages = await searchKnowledgeBase(ctx, q, { grant_id: grantId, donor_id: s.donorId });
    patchMessage(msgId, (m) => (m.role === 'agent' && m.kind === 'grant_status' ? { ...m, view: { ...m.view, citations: passages, policyLoading: false } } : m));
  }

  remember(ctx, { currentGrantId: grantId, lastIntent: intent, pendingIntent: undefined });

  // Intent-specific follow-through.
  if (view.withheld) {
    await escalate(ctx, {
      caseType: 'Due Diligence Question', reason: `Compliance-sensitive review (${sens}): withheld from self-service`,
      donorWords: userText, view, quiet: true,
    });
    return;
  }
  if (intent === 'expedite') {
    if (view.tone === 'review') {
      const g = ctx.step('reason', 'guard', 'Escalation rule', 'assistant can’t change review timelines → hand to a specialist');
      g.finish('warn', undefined, 2);
      await escalate(ctx, {
        caseType: 'Due Diligence Question', reason: 'Asked to expedite a grant in review', donorWords: userText, view,
        intro: 'I can’t change the review timeline. It’s a required check before any grant is paid. I’ve asked a specialist to look at it and follow up with you.',
      });
      return;
    }
    say({ role: 'agent', kind: 'text', text: `This grant is already past review, so there’s nothing to speed up on my side. If something looks wrong, I can connect you with a person.` });
  }
  if (intent === 'declined' && view.tone === 'declined') {
    const g = ctx.step('reason', 'guard', 'Policy', 'decline reasons only come from a specialist');
    g.finish('ok', undefined, 1);
  }

  store.set({ suggestions: suggestionsFor(view) });
}

function suggestionsFor(v: GrantStatusView): Chip[] {
  if (v.tone === 'review') {
    return v.overdue
      ? chips('Talk to a person', 'Why is it taking so long?', 'What is due diligence?', 'Show all my grants')
      : chips('Why is it taking so long?', 'What is due diligence?', 'Can this be sped up?', 'Talk to a person');
  }
  if (v.tone === 'approved') return chips('When will the charity get paid?', 'Show all my grants', 'Talk to a person');
  if (v.tone === 'declined') return chips('Why was it declined?', 'Talk to a person', 'Show all my grants');
  return chips('Show all my grants', 'Talk to a person');
}

// ------------------------------------------------------------------ escalation

interface EscalateOpts {
  caseType: string;
  reason: string;
  donorWords: string;
  view?: GrantStatusView;
  intro?: string;
  quiet?: boolean;
}

async function escalate(ctx: ToolCtx, o: EscalateOpts) {
  const s = store.get();
  const donor = demoDonors().find((d) => d.donor.donor_id === s.donorId)!.donor;
  const grantId = o.view?.grant.grant_id ?? s.memory.currentGrantId;
  const g = grantId ? grants.find((x) => x.grant_id === grantId) : undefined;
  const snapshot = o.view ?? lastStatusView();

  if (o.intro) say({ role: 'agent', kind: 'text', text: o.intro });
  const { caseId, caseType } = await createServiceRequest(ctx, o.caseType, { grant_id: grantId, donor_id: donor.donor_id });
  const { queue, slots } = await readQueue(ctx, caseType.escalation_team);

  const summaryParts = [`${donor.primary_contact_name} (${donor.account_name}) said: “${o.donorWords}”.`];
  if (g && snapshot) summaryParts.push(`Grant ${g.grant_id} for ${fmtMoney(g.grant_amount_usd)} to ${g.grantee_name} is ${snapshot.statusLabel.toLowerCase()}. ${snapshot.facts.filter((f) => f.label !== 'Submitted').map((f) => `${f.label}: ${f.value}`).join('; ')}.`);
  summaryParts.push(`Escalated by the assistant: ${o.reason}.`);

  const transcript = store.get().messages.map((m) => ({ who: m.role === 'user' ? 'Donor' : 'Assistant', text: messageToText(m) }));
  const rec: CaseRecord = {
    id: caseId,
    donorId: donor.donor_id,
    donorName: donor.primary_contact_name,
    accountName: donor.account_name,
    grantId,
    caseTypeId: caseType.case_type_id,
    caseType: caseType.case_type_name,
    team: caseType.escalation_team,
    slaHours: caseType.sla_hours,
    createdAt: now(),
    createdByAgent: true,
    reason: o.reason,
    donorWords: o.donorWords,
    summary: summaryParts.join(' '),
    nextStep: nextStepFor(o.reason, snapshot),
    transcript,
    taskIds: [...store.get().sessionTaskIds],
    grantSnapshot: snapshot,
    status: 'open',
    replies: [],
    live: true,
  };
  store.set((st) => ({ cases: [rec, ...st.cases] }));

  if (o.quiet) say({ role: 'agent', kind: 'text', text: 'I’ve shared this with a specialist. You can pick a time for them to call you.' });
  say({ role: 'agent', kind: 'escalation', caseId });
  const avail = queue.current_availability === 'AVAILABLE' ? 'specialists available now' : queue.current_availability === 'BUSY' ? 'team is busy right now' : 'team is offline until tomorrow';
  say({ role: 'agent', kind: 'callback', caseId, queueLine: `${queue.queue_name} · ${queue.queue_depth} in queue · ${avail}`, slots });
  store.set({ suggestions: [] });
  remember(ctx, { openCaseId: caseId });
}

function lastStatusView(): GrantStatusView | undefined {
  const msgs = store.get().messages;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'agent' && m.kind === 'grant_status') return m.view;
  }
  return undefined;
}

function nextStepFor(reason: string, v?: GrantStatusView) {
  if (/expedite/i.test(reason)) return 'Check the review’s progress and give the donor a realistic date';
  if (/sources down/i.test(reason)) return 'Look up the grant directly in the grants platform and call back';
  if (/Compliance/i.test(reason)) return 'Compliance to review before any donor contact';
  if (v?.overdue) return 'Find out why the review is past its estimate';
  if (v?.tone === 'declined') return 'Review the decline notes and explain options to the donor';
  return 'Call the donor and answer their question';
}

async function bookCallback(ctx: ToolCtx, caseId: string, slot: string, messageId: string, donorId: string) {
  const rec = store.get().cases.find((c) => c.id === caseId);
  patchMessage(messageId, (m) => (m.role === 'agent' && m.kind === 'callback' ? { ...m, chosen: slot } : m));
  await scheduleFollowUp(ctx, caseId, slot, { grant_id: rec?.grantId, donor_id: donorId });
  store.set((s) => ({
    cases: s.cases.map((c) => (c.id === caseId
      ? { ...c, callback: slot, taskIds: [...s.sessionTaskIds], transcript: [...c.transcript, { who: 'Donor', text: `Call me ${slot}` }] }
      : c)),
  }));
  say({ role: 'agent', kind: 'callback_confirmed', caseId, slot, team: rec?.team ?? 'our team' });
  store.set({ suggestions: chips('Show all my grants', 'Thanks!') });
  remember(ctx, { openCaseId: caseId });
}
