// Mock versions of the agent's tools. Each one looks up the fictional sample records in src/data/sample.ts,
// waits a moment to feel realistic, and reports a plain-language step that the flow panel and Q&A contract use.
// To connect the real agent, replace each body with a call to its service; keep the return shapes.

import { caseTypes, distributions, donors, dueDiligence, grantees, grants, queues } from '../data/sample';
import type { CaseType, Distribution, Grant } from '../data/types';
import { fmtDate } from './clock';
import { searchKb } from './kb';
import type { Phase, ToolBundle, TraceKind } from './types';

export interface StepHandle {
  finish: (status: 'ok' | 'warn' | 'fail', detail?: string) => void;
}

export interface ToolCtx {
  step: (phase: Phase, kind: TraceKind, label: string, detail: string) => StepHandle;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number) => Math.round(base + (Math.random() * 2 - 1) * spread);

async function run<T>(ctx: ToolCtx, kind: TraceKind, label: string, detail: string, ms: number, fn: () => T, done: (v: T) => string): Promise<T> {
  const h = ctx.step('act', kind, label, detail);
  await sleep(jitter(ms, ms * 0.25));
  const value = fn();
  h.finish('ok', done(value));
  return value;
}

export function getDonorProfile(ctx: ToolCtx, donorId: string) {
  return run(ctx, 'tool', 'get_donor_profile', 'Looking up the account', 60,
    () => donors.find((d) => d.donor_id === donorId),
    (d) => (d ? `${d.account_name} · ${d.account_status.toLowerCase()}` : 'Account not found'));
}

export function listGrants(ctx: ToolCtx, donorId: string): Promise<Grant[]> {
  return run(ctx, 'tool', 'get_grant_status', 'Listing the account’s grants', 80,
    () => grants.filter((x) => x.donor_id === donorId),
    (gs) => `${gs.length} grant${gs.length === 1 ? '' : 's'} found`);
}

export async function getGrantStatus(ctx: ToolCtx, grantId: string): Promise<ToolBundle> {
  const grant = await run(ctx, 'tool', 'get_grant_status', `Looking up grant ${grantId}`, 80,
    () => grants.find((x) => x.grant_id === grantId),
    (x) => (x ? `${statusWord(x.grant_status)}` : 'Grant not found'));
  return {
    grant,
    grantee: grantees.find((e) => e.grantee_ein === grant?.grantee_ein),
    distribution: latestDistribution(grantId),
  };
}

function statusWord(s: string) {
  return ({ PENDING_DD: 'In charity review', APPROVED: 'Approved', FUNDED: 'Paid', CLOSED: 'Closed', DENIED: 'Declined' } as Record<string, string>)[s] ?? s;
}

export function latestDistribution(grantId: string): Distribution | undefined {
  return distributions
    .filter((d) => d.grant_id === grantId)
    .sort((a, b) => b.distribution_date.localeCompare(a.distribution_date))[0];
}

export function checkDueDiligence(ctx: ToolCtx, grantId: string) {
  return run(ctx, 'tool', 'check_due_diligence', 'Checking the charity review', 80,
    () => dueDiligence.find((d) => d.grant_id === grantId),
    (d) => (d ? `Place ${d.queue_position} of ${d.total_queue_length} · estimate ${fmtDate(d.estimated_completion_date)}` : 'No review on file'));
}

export function searchKnowledgeBase(ctx: ToolCtx, query: string) {
  return run(ctx, 'kb', 'search_knowledge_base', 'Finding the approved policy that explains this', 1200,
    () => searchKb(query).map((x) => x.passage),
    (ps) => (ps.length ? `Cited: ${ps.map((p) => p.section).join('; ')}` : 'No approved passage found'));
}

let caseSeq = 418270;

export async function createServiceRequest(ctx: ToolCtx, caseTypeName: string): Promise<{ caseId: string; caseType: CaseType }> {
  const caseType = caseTypes.find((c) => c.case_type_name === caseTypeName) ?? caseTypes[0];
  const caseId = `CS-00${++caseSeq}`;
  await run(ctx, 'write', 'create_service_request', `Opening a case for ${caseType.escalation_team}`, 200,
    () => caseId, (id) => `${id} · ${caseType.case_type_name} · reply within ${caseType.sla_hours} h`);
  return { caseId, caseType };
}

export function readQueue(ctx: ToolCtx, team: string) {
  return run(ctx, 'tool', 'check_team_availability', `Checking ${team} availability`, 50,
    () => queues.find((q) => q.queue_name === team) ?? queues[0],
    (q) => `${q.current_availability.toLowerCase()} · ${q.queue_depth} waiting`);
}

/** Voice only: check the PIN entered on the keypad. The PIN is never shown, logged or returned. */
export function verifyCaller(ctx: ToolCtx, donorId: string, pin: string) {
  return run(ctx, 'auth', 'verify_caller', `Checking the PIN for ${donorId}`, 120,
    () => donors.some((d) => d.donor_id === donorId && d.voice_pin === pin),
    (ok) => (ok ? 'PIN matches' : 'PIN does not match'));
}
