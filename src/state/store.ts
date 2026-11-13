// Tiny global store (useSyncExternalStore). One conversation at a time, on one channel: chat or voice.
// Hand-offs from either channel land in the Rep console's case list. Nothing is persisted or sent anywhere.

import { useSyncExternalStore } from 'react';
import { caseTypes, demoDonors, dueDiligence, grants } from '../data/sample';
import { fmtDate, now } from '../agent/clock';
import { statusLabel } from '../agent/policy';
import type { Intent } from '../agent/intent';
import type { AgentMessage, CaseRecord, Exchange, TraceEvent } from '../agent/types';

/** Donor side (chat or voice) or the rep's side. */
export type View = 'assistant' | 'rep';

/** The two Amazon Connect channels the prototype simulates. Both reach the same grants agent. */
export type Channel = 'chat' | 'voice';

/** Voice call lifecycle (chat has no call). */
export type CallState = 'idle' | 'active' | 'transferring' | 'transferred' | 'ended';

export type TurnInput =
  | { type: 'text'; text: string }
  | { type: 'pick_grant'; grantId: string; label: string }
  /** Keypad (DTMF) digits on a voice call: donor ID, PIN or a menu choice. */
  | { type: 'keypad'; digits: string };

export interface Chip { label: string; input: TurnInput }

export interface Memory {
  currentGrantId?: string;
  pendingIntent?: Intent;
  lastIntent?: Intent;
  /** A question asked before sign-in, answered right after the donor is verified. */
  pendingQuestion?: string;
  /** Grants offered in the last list, in order, so a caller can press 1, 2, 3… */
  offered?: string[];
}

/** Authentication state. Chat: donor ID. Voice: donor ID, then a PIN on the keypad. */
export interface Auth {
  donorId: string | null;
  /** Voice only: the donor ID entered, waiting for its PIN. */
  candidateId?: string;
  attempts: number;
  locked: boolean;
  /** Continuing without verifying: general grant questions only, no account data. */
  guest: boolean;
}

export interface AppState {
  view: View;
  channel: Channel;
  call: CallState;
  auth: Auth;
  messages: AgentMessage[];
  suggestions: Chip[];
  busy: boolean;
  trace: TraceEvent[];
  turn: number;
  memory: Memory;
  /** The latest question and answer, as the flow panel and the Q&A contract show it. */
  exchange?: Exchange;
  /** Voice: read replies aloud (captions are always shown). */
  speak: boolean;
  /** Hand-offs from this session, plus two earlier sample cases. Kept when the donor starts over. */
  cases: CaseRecord[];
  repSelected?: string;
  toast?: string;
}

/** Two earlier, already-open cases so the Rep console isn't empty before a hand-off. */
function seedCases(): CaseRecord[] {
  const review = caseTypes.find((c) => c.case_type_name === 'Due Diligence Question')!;
  const picks = dueDiligence.filter((d) => d.escalation_flag && ['Missing docs', 'Large amount'].includes(d.escalation_reason));
  const donorsById = new Map(demoDonors().map((x) => [x.donor.donor_id, x.donor]));
  return picks.map((d, i) => {
    const g = grants.find((x) => x.grant_id === d.grant_id)!;
    const donor = donorsById.get(g.donor_id);
    return {
      id: `CS-0041826${i}`,
      channel: i === 0 ? 'voice' : 'chat',
      mode: i === 0 ? 'transfer' : 'case',
      donorId: g.donor_id,
      donorName: donor?.primary_contact_name ?? g.donor_id,
      accountName: donor?.account_name ?? '',
      verified: true,
      grantId: g.grant_id,
      caseTypeId: review.case_type_id,
      caseType: review.case_type_name,
      team: review.escalation_team,
      slaHours: review.sla_hours,
      createdAt: new Date(now().getTime() - (i + 1) * 3.5 * 3_600_000),
      createdByAgent: true,
      reason: d.escalation_reason === 'Missing docs' ? 'Review waiting on charity documents' : 'Donor asked about extra review',
      donorWords: '(earlier session)',
      summary: `Earlier assistant session. Grant ${g.grant_id} to ${g.grantee_name} is ${statusLabel(g.grant_status, d).label.toLowerCase()} (place ${d.queue_position} of ${d.total_queue_length}, estimate ${fmtDate(d.estimated_completion_date)}).`,
      nextStep: d.escalation_reason === 'Missing docs' ? 'Confirm which documents the charity still owes' : 'Confirm the additional review is on track',
      transcript: [{ who: 'System', text: 'Sample case created before this demo session.' }],
      status: 'open',
      replies: [],
      live: false,
    } satisfies CaseRecord;
  });
}

type Conversation = Omit<AppState, 'view' | 'cases' | 'repSelected' | 'toast'>;

const textChips = (...labels: string[]): Chip[] => labels.map((label) => ({ label, input: { type: 'text', text: label } }));

export const DEFAULT_SUGGESTIONS: Chip[] = textChips('Where’s my grant?', 'Why is my grant pending?', 'Show all my grants', 'Where’s my contribution?');

/** Chat sign-in chips: one per sample donor ID (fictional), plus the way to continue without one. */
export const SIGN_IN_SUGGESTIONS: Chip[] = [
  ...demoDonors().map(({ donor }): Chip => ({ label: `Use sample ID ${donor.donor_id}`, input: { type: 'text', text: donor.donor_id } })),
  ...textChips('I don’t have my donor ID'),
];

/** Voice sign-in phrases (the keypad is the main way to verify). */
export const VOICE_SIGN_IN_SUGGESTIONS: Chip[] = textChips('I don’t know my donor ID', 'Talk to a person');

let idSeq = 0;
export const uid = (p: string) => `${p}-${++idSeq}`;

export const CHAT_WELCOME =
  'Hi, I’m the grants assistant. I can answer questions about grants on your account, like where a grant is, why it’s pending, or when the charity will be paid. To start, please enter your donor ID. If you don’t have it, I can still answer general questions.';

export const VOICE_WELCOME =
  'Thanks for calling Vanguard Charitable. I’m the grants assistant. Using your keypad, enter the two digits of your donor ID, then press pound. If you don’t know it, just say so.';

function welcome(channel: Channel): AgentMessage[] {
  return channel === 'chat' ? [{ id: uid('m'), role: 'agent', kind: 'text', text: CHAT_WELCOME }] : [];
}

function fresh(channel: Channel): Conversation {
  return {
    channel,
    call: 'idle',
    auth: { donorId: null, attempts: 0, locked: false, guest: false },
    messages: welcome(channel),
    suggestions: channel === 'chat' ? SIGN_IN_SUGGESTIONS : [],
    busy: false,
    trace: [],
    turn: 0,
    memory: {},
    exchange: undefined,
    speak: state?.speak ?? true,
  };
}

let state: AppState = undefined as unknown as AppState;
state = { ...fresh('chat'), view: 'assistant', cases: seedCases() };
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state));
}

export function toast(text: string) {
  store.set({ toast: text });
  setTimeout(() => { if (store.get().toast === text) store.set({ toast: undefined }); }, 2600);
}

/** Start over on a channel. Signs out: a new conversation always authenticates again. */
export function startOver(channel: Channel = state.channel) {
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  store.set(fresh(channel));
}

/** Voice: pick up the call. The IVR greets the caller and asks for the donor ID on the keypad. */
export function startCall() {
  startOver('voice');
  store.set({
    call: 'active',
    messages: [{ id: uid('m'), role: 'agent', kind: 'text', text: VOICE_WELCOME }],
    suggestions: VOICE_SIGN_IN_SUGGESTIONS,
  });
}
