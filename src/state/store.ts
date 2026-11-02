// Tiny global store (useSyncExternalStore) so the donor chat, rep console and audit log share one
// live session: a case escalated in chat appears in the rep queue immediately.

import { useSyncExternalStore } from 'react';
import { demoDonors, dueDiligence, grants, seedTasks } from '../data/load';
import type { Task } from '../data/types';
import { isoStamp, now } from '../agent/clock';
import type { Intent } from '../agent/intent';
import { statusLabel } from '../agent/policy';
import type { AgentMessage, CaseRecord, Role, Scenario, TraceEvent } from '../agent/types';

export type View = 'donor' | 'rep' | 'audit' | 'a11y';

export type TurnInput =
  | { type: 'text'; text: string }
  | { type: 'pick_grant'; grantId: string; label: string }
  | { type: 'slot'; caseId: string; slot: string; messageId: string };

export interface Chip { label: string; input: TurnInput }

export interface Memory {
  currentGrantId?: string;
  pendingIntent?: Intent;
  lastIntent?: Intent;
  openCaseId?: string;
}

export interface AppState {
  view: View;
  donorId: string;
  role: Role;
  scenario: Scenario;
  showTrace: boolean;
  messages: AgentMessage[];
  suggestions: Chip[];
  busy: boolean;
  trace: TraceEvent[];
  turn: number;
  memory: Memory;
  cases: CaseRecord[];
  tasks: Task[];
  sessionTaskIds: string[];
  repSelected?: string;
  toast?: string;
}

export const DEFAULT_SUGGESTIONS: Chip[] = [
  'Where’s my grant?', 'Why is my grant pending?', 'Show all my grants', 'Where’s my contribution?',
].map((label) => ({ label, input: { type: 'text', text: label } }));

let idSeq = 0;
export const uid = (p: string) => `${p}-${++idSeq}`;

function seedCases(): CaseRecord[] {
  const picks = dueDiligence
    .filter((d) => d.escalation_flag && ['Missing docs', 'Large amount'].includes(d.escalation_reason))
    .filter((d) => grants.find((g) => g.grant_id === d.grant_id)?.grant_status === 'PENDING_DD')
    .slice(0, 3);
  const donorsById = new Map(demoDonors().map((x) => [x.donor.donor_id, x.donor]));
  return picks.map((d, i) => {
    const g = grants.find((x) => x.grant_id === d.grant_id)!;
    const donor = donorsById.get(d.donor_id);
    const created = new Date(now().getTime() - (i + 1) * 5.5 * 3_600_000);
    return {
      id: `CS-0041826${i}`,
      donorId: d.donor_id,
      donorName: donor?.primary_contact_name ?? d.donor_id,
      accountName: donor?.account_name ?? '',
      grantId: g.grant_id,
      caseTypeId: 'CT-106',
      caseType: 'Due Diligence Question',
      team: 'Accounting',
      slaHours: 8,
      createdAt: created,
      createdByAgent: true,
      reason: d.escalation_reason === 'Missing docs' ? 'Review waiting on charity documents' : 'Donor asked about extra review',
      donorWords: '(earlier session)',
      summary: `Earlier assistant session. Grant ${g.grant_id} to ${g.grantee_name} is ${statusLabel(g.grant_status, d).label.toLowerCase()} (#${d.queue_position} of ${d.total_queue_length}, ETA ${d.estimated_completion_date}). Flag on file: ${d.escalation_reason}.`,
      nextStep: d.escalation_reason === 'Missing docs' ? 'Confirm which documents the charity still owes' : 'Confirm the additional review is on track',
      transcript: [{ who: 'System', text: 'Created before this demo session. The synthetic extract does not include its transcript.' }],
      taskIds: seedTasks.filter((t) => t.grant_id === g.grant_id).map((t) => t.task_id),
      status: 'open',
      replies: [],
      live: false,
    } satisfies CaseRecord;
  });
}

function initial(): AppState {
  const first = demoDonors()[0].donor;
  return {
    view: 'donor',
    donorId: first.donor_id,
    role: 'holder',
    scenario: 'normal',
    showTrace: true,
    messages: [greeting(first.primary_contact_name)],
    suggestions: DEFAULT_SUGGESTIONS,
    busy: false,
    trace: [],
    turn: 0,
    memory: {},
    cases: seedCases(),
    tasks: [...seedTasks].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    sessionTaskIds: [],
  };
}

export function greeting(name: string, role: Role = 'holder'): AgentMessage {
  const first = role === 'holder' ? name.split(' ')[0] : role === 'advisor' ? 'Sam' : 'Taylor';
  return {
    id: uid('m'), role: 'agent', kind: 'text',
    text: `Hi ${first}, I can help with questions about your grants, like where a grant is, why it’s pending, or when the charity will be paid. What would you like to know?`,
  };
}

let state: AppState = initial();
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

let taskSeq = 0;
export function appendTask(t: Omit<Task, 'task_id' | 'created_at' | 'created_by_agent' | 'agent_name'>): string {
  const task: Task = {
    ...t,
    task_id: `T-${200000 + ++taskSeq}`,
    created_at: isoStamp(now()),
    created_by_agent: true,
    agent_name: 'grant-copilot-prototype',
    isNew: true,
  };
  store.set((s) => ({ tasks: [task, ...s.tasks], sessionTaskIds: [...s.sessionTaskIds, task.task_id] }));
  return task.task_id;
}

export function toast(text: string) {
  store.set({ toast: text });
  setTimeout(() => { if (store.get().toast === text) store.set({ toast: undefined }); }, 2600);
}

/** Reset the donor conversation (keeps cases and audit rows, like a new chat session). */
export function newConversation(patch: Partial<AppState> = {}) {
  const s = { ...state, ...patch };
  const donor = demoDonors().find((d) => d.donor.donor_id === s.donorId)?.donor;
  store.set({
    ...patch,
    messages: [greeting(donor?.primary_contact_name ?? 'there', s.role)],
    suggestions: DEFAULT_SUGGESTIONS,
    trace: [],
    memory: {},
    busy: false,
    sessionTaskIds: [],
  });
}
