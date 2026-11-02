// Loads the synthetic CSV extracts (shared by Vanguard Charitable, Oct 2026) into typed arrays.
// In production these are Athena point lookups against the gold layer; see src/agent/tools.ts.

import donorCsv from './csv/sf_donor_profile.csv?raw';
import grantCsv from './csv/grant_master.csv?raw';
import ddCsv from './csv/due_diligence_queue.csv?raw';
import distCsv from './csv/grant_distribution_history.csv?raw';
import einCsv from './csv/grantee_ein_registry.csv?raw';
import caseTypeCsv from './csv/sf_case_types.csv?raw';
import queueCsv from './csv/sf_escalation_queues.csv?raw';
import taskCsv from './csv/sf_tasks.csv?raw';
import type {
  CaseType, Distribution, DonorProfile, DueDiligence, EscalationQueue, Grant, Grantee, Task,
} from './types';

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...rest] = rows;
  return rest
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
}

const num = (v: string) => (v === '' ? 0 : Number(v));
const bool = (v: string) => v.toLowerCase() === 'true';

export const donors: DonorProfile[] = parseCsv(donorCsv).map((r) => ({
  donor_id: r.donor_id,
  account_status: r.account_status,
  account_name: r.account_name,
  primary_contact_name: r.primary_contact_name,
  primary_contact_email: r.primary_contact_email,
  vc_account_number: r.vc_account_number,
  vc_fund_balance: num(r.vc_fund_balance),
  fund_balance_date: r.fund_balance_date,
}));

export const grants: Grant[] = parseCsv(grantCsv).map((r) => ({
  grant_id: r.grant_id,
  donor_id: r.donor_id,
  grant_amount_usd: num(r.grant_amount_usd),
  grant_status: r.grant_status,
  grantee_name: r.grantee_name,
  grantee_ein: r.grantee_ein,
  submitted_date: r.submitted_date,
  approved_date: r.approved_date,
  funded_date: r.funded_date,
  last_modified: r.last_modified,
  load_date: r.load_date,
}));

export const dueDiligence: DueDiligence[] = parseCsv(ddCsv).map((r) => ({
  grant_id: r.grant_id,
  donor_id: r.donor_id,
  review_state: r.review_state,
  queue_position: num(r.queue_position),
  total_queue_length: num(r.total_queue_length),
  typical_review_days: num(r.typical_review_days),
  estimated_completion_date: r.estimated_completion_date,
  review_notes: r.review_notes,
  escalation_flag: bool(r.escalation_flag),
  escalation_reason: r.escalation_reason,
  last_modified: r.last_modified,
  load_date: r.load_date,
}));

export const distributions: Distribution[] = parseCsv(distCsv).map((r) => ({
  distribution_id: r.distribution_id,
  grant_id: r.grant_id,
  donor_id: r.donor_id,
  distribution_status: r.distribution_status,
  distribution_amount: num(r.distribution_amount),
  distribution_date: r.distribution_date,
  cleared_date: r.cleared_date,
  wire_reference: r.wire_reference,
}));

export const grantees: Grantee[] = parseCsv(einCsv).map((r) => ({
  grantee_ein: r.grantee_ein,
  organization_name: r.organization_name,
  irs_status: r.irs_status,
  sanctions_flag: bool(r.sanctions_flag),
  sanctions_reason: r.sanctions_reason,
}));

export const caseTypes: CaseType[] = parseCsv(caseTypeCsv).map((r) => ({
  case_type_id: r.case_type_id,
  case_type_name: r.case_type_name,
  escalation_team: r.escalation_team,
  sla_hours: num(r.sla_hours),
}));

export const queues: EscalationQueue[] = parseCsv(queueCsv).map((r) => ({
  queue_id: r.queue_id,
  queue_name: r.queue_name,
  current_availability: r.current_availability,
  queue_depth: num(r.queue_depth),
  avg_handle_time_min: num(r.avg_handle_time_min),
}));

export const seedTasks: Task[] = parseCsv(taskCsv).map((r) => ({
  task_id: r.task_id,
  grant_id: r.grant_id,
  donor_id: r.donor_id,
  task_type: r.task_type,
  task_status: r.task_status,
  created_by_agent: bool(r.created_by_agent),
  agent_name: r.agent_name,
  result_summary: r.result_summary,
  execution_time_ms: num(r.execution_time_ms),
  error_message: r.error_message,
  created_at: r.created_at.slice(0, 19),
}));

/** Donors that have at least one grant, most grants first: the sign-in list for the demo. */
export function demoDonors() {
  const counts = new Map<string, number>();
  grants.forEach((g) => counts.set(g.donor_id, (counts.get(g.donor_id) ?? 0) + 1));
  return donors
    .filter((d) => counts.has(d.donor_id))
    .map((d) => ({ donor: d, grantCount: counts.get(d.donor_id) ?? 0 }))
    .sort((a, b) => b.grantCount - a.grantCount || a.donor.account_name.localeCompare(b.donor.account_name));
}
