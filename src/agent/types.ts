import type { DonorProfile, Grant, DueDiligence, Distribution, Grantee, Task } from '../data/types';
import type { KbPassage } from './kb';

/** Demo switch for the data-source fallback chain described in section 10 of the schema doc. */
export type Scenario = 'normal' | 'stale' | 'athena_down' | 'all_down';

/** Stand-in roles until Sugu shares the real roles, personas and data-access rules. */
export type Role = 'holder' | 'advisor' | 'family';

export type Phase = 'understand' | 'reason' | 'act' | 'remember';

export type TraceKind = 'auth' | 'intent' | 'tool' | 'kb' | 'guard' | 'fallback' | 'fail' | 'write' | 'memory';

export interface TraceEvent {
  id: string;
  turn: number;
  phase: Phase;
  kind: TraceKind;
  label: string;
  detail: string;
  sql?: string;
  ms?: number;
  status: 'running' | 'ok' | 'warn' | 'fail';
}

export interface StatusStep { label: string; state: 'done' | 'current' | 'todo' | 'stopped' }

export interface StatusFact { label: string; value: string; tone?: 'warn' | 'ok' }

export interface GrantStatusView {
  grant: Grant;
  statusLabel: string;
  tone: 'review' | 'approved' | 'paid' | 'closed' | 'declined';
  steps: StatusStep[];
  facts: StatusFact[];
  explanation: string;
  withheld: boolean;
  sources: string[];
  asOf: string;
  freshnessWarning?: string;
  overdue: boolean;
  citations: KbPassage[];
  policyLoading: boolean;
}

export interface CaseRecord {
  id: string;
  donorId: string;
  donorName: string;
  accountName: string;
  grantId?: string;
  caseTypeId: string;
  caseType: string;
  team: string;
  slaHours: number;
  createdAt: Date;
  createdByAgent: boolean;
  reason: string;
  donorWords: string;
  summary: string;
  nextStep: string;
  transcript: { who: string; text: string }[];
  taskIds: string[];
  grantSnapshot?: GrantStatusView;
  callback?: string;
  status: 'open' | 'resolved';
  replies: string[];
  live: boolean;
}

export interface CallbackSlot { id: string; label: string; sub: string }

export type AgentMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'agent'; kind: 'text'; text: string }
  | { id: string; role: 'agent'; kind: 'grant_picker'; prompt: string; grants: { grant: Grant; statusLabel: string; tone: GrantStatusView['tone'] }[] }
  | { id: string; role: 'agent'; kind: 'grant_status'; view: GrantStatusView }
  | { id: string; role: 'agent'; kind: 'kb_answer'; text: string; passages: KbPassage[] }
  | { id: string; role: 'agent'; kind: 'notice'; tone: 'warn' | 'lock' | 'error'; title: string; body: string }
  | { id: string; role: 'agent'; kind: 'escalation'; caseId: string }
  | { id: string; role: 'agent'; kind: 'callback'; caseId: string; queueLine: string; slots: CallbackSlot[]; chosen?: string }
  | { id: string; role: 'agent'; kind: 'callback_confirmed'; caseId: string; slot: string; team: string };

export interface ToolBundle {
  donor?: DonorProfile;
  grant?: Grant;
  dd?: DueDiligence;
  distribution?: Distribution;
  grantee?: Grantee;
  source: string;
  ageHours: number;
}

export type NewTask = Omit<Task, 'task_id' | 'created_at' | 'created_by_agent' | 'agent_name'>;
