// Mock implementations of the six MCP agent tools (3 READ, 2 WRITE, 1 SEARCH) from the schema doc,
// section 5 "Agent Tool Table Mapping". Each one:
//   * reads the synthetic gold-layer rows,
//   * simulates the documented latency and fallback chain (section 10),
//   * emits trace steps for the "Under the hood" panel,
//   * appends an audit row to sf_tasks.
// To go live, replace the bodies with calls to the real Bedrock AgentCore / MCP endpoints; the return
// shapes are what the UI depends on.

import {
  caseTypes, distributions, donors, dueDiligence, grantees, grants, queues,
} from '../data/load';
import type { CaseType, Distribution, Grant } from '../data/types';
import { fmtTime, now } from './clock';
import { searchKb } from './kb';
import type { CallbackSlot, NewTask, Phase, Scenario, ToolBundle, TraceKind } from './types';

export interface StepHandle {
  finish: (status: 'ok' | 'warn' | 'fail', detail?: string, ms?: number) => void;
}

export interface ToolCtx {
  scenario: Scenario;
  step: (phase: Phase, kind: TraceKind, label: string, detail: string, sql?: string) => StepHandle;
  audit: (t: NewTask) => string;
}

export class AllSourcesDown extends Error {
  tool: string;
  constructor(tool: string) { super(`${tool}: all data sources unavailable`); this.tool = tool; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number) => Math.round(base + (Math.random() * 2 - 1) * spread);

/** Freshness targets per gold table (schema doc, section 7). */
const FRESHNESS_TARGET_H: Record<string, number> = {
  'gold.sf_donor_profile': 24,
  'gold.grant_master': 4,
  'gold.due_diligence_queue': 1,
  'gold.grant_distribution_history': 24,
  'gold.grantee_ein_registry': 168,
};

function goldAgeHours(scenario: Scenario) {
  return scenario === 'stale' ? 6.2 : 0.6;
}

interface Fallback { name: string; detail: string; ms: number; downIn: Scenario[] }

/**
 * Primary gold-layer read with the documented fall-through:
 * gold (Athena) → fallbacks in order → AllSourcesDown (the caller escalates to a human).
 */
async function readWithFallback<T>(
  ctx: ToolCtx,
  tool: string,
  table: string,
  sql: string,
  lookup: () => T,
  fallbacks: Fallback[],
  ids: { grant_id?: string; donor_id?: string },
  summarize: (v: T) => string,
): Promise<{ value: T; source: string; ageHours: number }> {
  const s = ctx.scenario;
  const h = ctx.step('act', 'tool', tool, `${table} · Athena point lookup`, sql);
  const t0 = performance.now();
  await sleep(jitter(70, 25));
  const ms = Math.round(performance.now() - t0);
  const athenaDown = s === 'athena_down' || s === 'all_down';
  const age = goldAgeHours(s);
  const target = FRESHNESS_TARGET_H[table] ?? 24;

  if (athenaDown) {
    h.finish('fail', 'Athena query failed: timeout', ms);
    ctx.audit({ ...blankTask(ids), task_type: tool, task_status: 'FAILED', execution_time_ms: ms, error_message: 'Timeout calling Athena', result_summary: '' });
  } else if (age > target) {
    h.finish('warn', `${table} is ${age}h old (target < ${target}h) → not served`, ms);
  } else {
    const value = lookup();
    h.finish('ok', `${summarize(value)} · data age ${age}h`, ms);
    ctx.audit({ ...blankTask(ids), task_type: tool, task_status: 'COMPLETED', execution_time_ms: ms, error_message: '', result_summary: summarize(value) });
    return { value, source: table, ageHours: age };
  }

  for (const fb of fallbacks) {
    const fh = ctx.step('act', 'fallback', `Fallback · ${fb.name}`, fb.detail);
    const f0 = performance.now();
    await sleep(jitter(fb.ms, fb.ms * 0.12));
    const fms = Math.round(performance.now() - f0);
    if (fb.downIn.includes(s)) {
      fh.finish('fail', `${fb.name} unavailable`, fms);
      continue;
    }
    const value = lookup();
    fh.finish('ok', `${summarize(value)} · live data`, fms);
    ctx.audit({ ...blankTask(ids), task_type: tool, task_status: 'COMPLETED', execution_time_ms: fms, error_message: '', result_summary: `${summarize(value)} (via ${fb.name})` });
    return { value, source: `${fb.name} (live)`, ageHours: 0 };
  }

  ctx.audit({ ...blankTask(ids), task_type: tool, task_status: 'FAILED', execution_time_ms: 0, error_message: 'All data sources unavailable', result_summary: '' });
  throw new AllSourcesDown(tool);
}

function blankTask(ids: { grant_id?: string; donor_id?: string }) {
  return { grant_id: ids.grant_id ?? '', donor_id: ids.donor_id ?? '' };
}

// ---------------------------------------------------------------- READ tools

export async function getDonorProfile(ctx: ToolCtx, donorId: string) {
  const r = await readWithFallback(
    ctx, 'get_donor_profile', 'gold.sf_donor_profile',
    `SELECT * FROM gold.sf_donor_profile\nWHERE donor_id = '${donorId}'\n  AND load_date = CURRENT_DATE LIMIT 1;`,
    () => donors.find((d) => d.donor_id === donorId),
    [{ name: 'Salesforce API', detail: 'Account + Contact objects', ms: 320, downIn: [] }],
    { donor_id: donorId },
    (d) => (d ? `${d.account_name} · ${d.account_status}` : 'no row'),
  );
  return r.value;
}

const GRANT_FALLBACKS: Fallback[] = [
  { name: 'Gemini DB TDAF_GRANT', detail: 'Oracle · different schema, ~500 ms', ms: 480, downIn: ['all_down'] },
  { name: 'Grant System API', detail: 'rate-limited, ~1–2 s', ms: 1350, downIn: ['all_down'] },
];

export async function listGrants(ctx: ToolCtx, donorId: string): Promise<Grant[]> {
  const r = await readWithFallback(
    ctx, 'get_grant_status', 'gold.grant_master',
    `SELECT grant_id, grant_status, grant_amount_usd, grantee_name\nFROM gold.grant_master\nWHERE donor_id = '${donorId}'\n  AND load_date = CURRENT_DATE;`,
    () => grants.filter((g) => g.donor_id === donorId),
    GRANT_FALLBACKS,
    { donor_id: donorId },
    (gs) => `${gs.length} grants for ${donorId}`,
  );
  return r.value;
}

export async function getGrantStatus(ctx: ToolCtx, grantId: string): Promise<ToolBundle> {
  const grant = grants.find((g) => g.grant_id === grantId);
  const r = await readWithFallback(
    ctx, 'get_grant_status', 'gold.grant_master',
    `SELECT grant_id, grant_status, grant_amount_usd,\n       approved_date, funded_date\nFROM gold.grant_master\nWHERE grant_id = '${grantId}'\n  AND load_date = CURRENT_DATE LIMIT 1;`,
    () => grant,
    GRANT_FALLBACKS,
    { grant_id: grantId, donor_id: grant?.donor_id },
    (g) => (g ? `${g.grant_status} · $${Math.round(g.grant_amount_usd).toLocaleString()}` : 'no row'),
  );

  const grantee = grantees.find((e) => e.grantee_ein === grant?.grantee_ein);
  const distribution = latestDistribution(grantId);

  if (r.source === 'gold.grant_master') {
    const e = ctx.step('act', 'tool', 'enrich · grantee_ein_registry', 'gold.grantee_ein_registry',
      `SELECT irs_status, sanctions_flag\nFROM gold.grantee_ein_registry\nWHERE grantee_ein = '${grant?.grantee_ein}';`);
    await sleep(jitter(35, 10));
    e.finish('ok', grantee ? `IRS ${grantee.irs_status} · sanctions ${grantee.sanctions_flag ? 'FLAGGED' : 'clear'}` : 'no row', 34);
    if (grant && ['APPROVED', 'FUNDED', 'CLOSED'].includes(grant.grant_status)) {
      const d = ctx.step('act', 'tool', 'enrich · distribution_history', 'gold.grant_distribution_history',
        `SELECT distribution_status, distribution_date, cleared_date\nFROM gold.grant_distribution_history\nWHERE grant_id = '${grantId}'\nORDER BY distribution_date DESC LIMIT 1;`);
      await sleep(jitter(40, 10));
      d.finish('ok', distribution ? `${distribution.distribution_status || 'status missing'} · ${distribution.distribution_date}` : 'no distribution yet', 41);
    }
  }
  return { grant: r.value, grantee, distribution, source: r.source, ageHours: r.ageHours };
}

export function latestDistribution(grantId: string): Distribution | undefined {
  return distributions
    .filter((d) => d.grant_id === grantId)
    .sort((a, b) => b.distribution_date.localeCompare(a.distribution_date))[0];
}

export async function checkDueDiligence(ctx: ToolCtx, grantId: string, donorId: string) {
  const r = await readWithFallback(
    ctx, 'check_due_diligence', 'gold.due_diligence_queue',
    `SELECT queue_position, total_queue_length,\n       estimated_completion_date, review_notes\nFROM gold.due_diligence_queue\nWHERE grant_id = '${grantId}'\n  AND load_date = CURRENT_DATE LIMIT 1;`,
    () => dueDiligence.find((d) => d.grant_id === grantId),
    [{ name: 'Grant System API', detail: 'due diligence endpoint, ~1–2 s', ms: 1150, downIn: ['all_down'] }],
    { grant_id: grantId, donor_id: donorId },
    (d) => (d ? `${d.review_state} · #${d.queue_position} of ${d.total_queue_length} · ETA ${d.estimated_completion_date}` : 'no row'),
  );
  return { dd: r.value, source: r.source, ageHours: r.ageHours };
}

// ---------------------------------------------------------------- SEARCH tool

export async function searchKnowledgeBase(ctx: ToolCtx, query: string, ids: { grant_id?: string; donor_id?: string }) {
  const h = ctx.step('act', 'kb', 'search_knowledge_base', `Bedrock KB · "${query.slice(0, 48)}"`);
  const t0 = performance.now();
  await sleep(jitter(1250, 250));
  const hits = searchKb(query);
  const ms = Math.round(performance.now() - t0);
  h.finish(hits.length ? 'ok' : 'warn', hits.length ? `${hits.length} passages · top: ${hits[0].passage.section} (${hits[0].score.toFixed(2)})` : 'no passage above threshold', ms);
  ctx.audit({ ...blankTask(ids), task_type: 'search_knowledge_base', task_status: 'COMPLETED', execution_time_ms: ms, error_message: '', result_summary: hits.map((x) => x.passage.section).join('; ') || 'no match' });
  return hits.map((x) => x.passage);
}

// ---------------------------------------------------------------- WRITE tools

let caseSeq = 418270;
let taskSeq = 0;
export const nextTaskSeq = () => ++taskSeq;

export async function createServiceRequest(
  ctx: ToolCtx, caseTypeName: string, ids: { grant_id?: string; donor_id: string },
): Promise<{ caseId: string; caseType: CaseType }> {
  const ct = caseTypes.find((c) => c.case_type_name === caseTypeName) ?? caseTypes[0];
  const caseId = `CS-00${++caseSeq}`;
  const h = ctx.step('act', 'write', 'create_service_request',
    `gold.sf_case_types → ${ct.case_type_name} · ${ct.escalation_team} · SLA ${ct.sla_hours}h`,
    `SELECT escalation_team, sla_hours FROM gold.sf_case_types\nWHERE case_type_id = '${ct.case_type_id}';\n-- then: INSERT Salesforce Case (direct SF API)`);
  const t0 = performance.now();
  await sleep(jitter(210, 40));
  const ms = Math.round(performance.now() - t0);
  h.finish('ok', `${caseId} created → ${ct.escalation_team}`, ms);
  ctx.audit({ ...blankTask(ids), task_type: 'create_service_request', task_status: 'COMPLETED', execution_time_ms: ms, error_message: '', result_summary: `${caseId} · ${ct.case_type_name} → ${ct.escalation_team}` });
  return { caseId, caseType: ct };
}

export async function readQueue(ctx: ToolCtx, team: string) {
  const q = queues.find((x) => x.queue_name === team) ?? queues[0];
  const h = ctx.step('act', 'tool', 'read · sf_escalation_queues', `gold.sf_escalation_queues → ${q.queue_name}`,
    `SELECT current_availability, queue_depth, avg_handle_time_min\nFROM gold.sf_escalation_queues\nWHERE queue_name = '${q.queue_name}';`);
  await sleep(jitter(45, 10));
  h.finish('ok', `${q.current_availability} · ${q.queue_depth} waiting · ~${q.avg_handle_time_min} min handle time`, 45);
  return { queue: q, slots: callbackSlots(q.current_availability) };
}

function callbackSlots(availability: string): CallbackSlot[] {
  const start = now();
  const first = new Date(start);
  const leadMin = availability === 'AVAILABLE' ? 60 : availability === 'BUSY' ? 180 : 0;
  if (availability === 'OFFLINE') {
    first.setUTCDate(first.getUTCDate() + 1);
    first.setUTCHours(14, 0, 0, 0); // 10:00 AM ET
  } else {
    first.setTime(first.getTime() + leadMin * 60_000);
    first.setUTCMinutes(first.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
  }
  const out: CallbackSlot[] = [];
  const d = new Date(first);
  for (let i = 0; i < 3; i++) {
    const today = d.getUTCDate() === start.getUTCDate();
    const end = new Date(d.getTime() + 30 * 60_000);
    out.push({
      id: `slot-${i}`,
      label: `${today ? 'Today' : 'Tomorrow'}, ${fmtTime(d).replace(' ET', '')}–${fmtTime(end)}`,
      sub: i === 0 ? 'Earliest available' : 'Available',
    });
    d.setTime(d.getTime() + (i === 0 ? 90 : 120) * 60_000);
    if (d.getUTCHours() >= 21) { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(14, 0, 0, 0); }
  }
  return out;
}

export async function scheduleFollowUp(ctx: ToolCtx, caseId: string, slot: string, ids: { grant_id?: string; donor_id: string }) {
  const h = ctx.step('act', 'write', 'schedule_follow_up', `INSERT Salesforce Task · ${slot}`,
    `-- direct SF API\nINSERT INTO Salesforce.Task (WhatId, Subject, ActivityDate, created_by_agent)\nVALUES ('${caseId}', 'Donor callback', '${slot}', true);`);
  const t0 = performance.now();
  await sleep(jitter(175, 30));
  const ms = Math.round(performance.now() - t0);
  h.finish('ok', `callback booked on ${caseId} · created_by_agent = true`, ms);
  ctx.audit({ ...blankTask(ids), task_type: 'schedule_follow_up', task_status: 'COMPLETED', execution_time_ms: ms, error_message: '', result_summary: `Callback ${slot} on ${caseId}` });
}
