import type { DonorProfile, Grant, DueDiligence, Distribution, Grantee } from '../data/types';
import type { KbPassage } from './kb';

export type Phase = 'understand' | 'reason' | 'act' | 'remember';

export type TraceKind = 'auth' | 'intent' | 'tool' | 'kb' | 'guard' | 'fail' | 'write' | 'memory';

export interface TraceEvent {
  id: string;
  turn: number;
  phase: Phase;
  kind: TraceKind;
  label: string;
  detail: string;
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
  overdue: boolean;
  citations: KbPassage[];
  policyLoading: boolean;
}

/** A hand-off, as the rep sees it in the Rep console. Chat hand-offs open a case; voice hand-offs transfer the call. */
export interface CaseRecord {
  id: string;
  channel: 'chat' | 'voice';
  mode: 'case' | 'transfer';
  donorId: string;
  donorName: string;
  accountName: string;
  verified: boolean;
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
  grantSnapshot?: GrantStatusView;
  status: 'open' | 'resolved';
  replies: string[];
  live: boolean;
}

export type Outcome = 'answered' | 'sign_in' | 'generic' | 'handoff';

/** One question and its answer: what the flow panel shows and what the Q&A contract carries. */
export interface Exchange {
  turn: number;
  channel: 'chat' | 'voice';
  /** The question after the PII guardrail (never the raw text). */
  question: string;
  piiRemoved: string[];
  /** `guest`: the donor chose to continue without verifying (general questions only). */
  authentication: { status: 'needed' | 'verified' | 'failed' | 'locked' | 'guest'; method: string; donorId?: string; detail: string };
  /** `limited`: answered with general information only, no account data. */
  authorization: { status: 'allowed' | 'blocked' | 'limited' | 'not_reached'; detail: string };
  routing?: { intent: string; agent: string; toolset?: string; live: boolean };
  tools: string[];
  sources: string[];
  answer: string;
  outcome: Outcome;
  handoff?: { caseId: string; team: string; responseHours: number; mode: 'case' | 'transfer' };
}

export type AgentMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'agent'; kind: 'text'; text: string }
  | { id: string; role: 'agent'; kind: 'grant_picker'; prompt: string; grants: { grant: Grant; statusLabel: string; tone: GrantStatusView['tone'] }[] }
  | { id: string; role: 'agent'; kind: 'grant_status'; view: GrantStatusView }
  | { id: string; role: 'agent'; kind: 'kb_answer'; text: string; passages: KbPassage[] }
  | { id: string; role: 'agent'; kind: 'notice'; tone: 'warn' | 'lock' | 'error'; title: string; body: string }
  | { id: string; role: 'agent'; kind: 'handoff'; caseId: string; team: string; responseHours: number; reason: string; mode: 'case' | 'transfer' };

export interface ToolBundle {
  donor?: DonorProfile;
  grant?: Grant;
  dd?: DueDiligence;
  distribution?: Distribution;
  grantee?: Grantee;
}
