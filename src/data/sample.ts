// FICTIONAL SAMPLE DATA, written by hand for this prototype.
// Every person, fund, charity, account number and EIN below is invented. No real donor data and no client
// data extract is included in, or processed by, this repository. Dates are relative to the demo date in
// src/agent/clock.ts (2026-09-30).

import type { CaseType, Distribution, DonorProfile, DueDiligence, EscalationQueue, Grant, Grantee } from './types';

export const donors: DonorProfile[] = [
  { donor_id: 'D-01', account_status: 'ACTIVE', account_name: 'Avery Family Giving Fund', primary_contact_name: 'Jordan Avery', account_number: 'SAMPLE-1001', fund_balance: 1_284_500, fund_balance_date: '2026-09-29', voice_pin: '1111' },
  { donor_id: 'D-02', account_status: 'ACTIVE', account_name: 'Shah Family Fund', primary_contact_name: 'Priya Shah', account_number: 'SAMPLE-1002', fund_balance: 642_000, fund_balance_date: '2026-09-29', voice_pin: '2222' },
  { donor_id: 'D-03', account_status: 'ACTIVE', account_name: 'Lee Charitable Fund', primary_contact_name: 'Morgan Lee', account_number: 'SAMPLE-1003', fund_balance: 210_750, fund_balance_date: '2026-09-29', voice_pin: '3333' },
  { donor_id: 'D-04', account_status: 'SUSPENDED', account_name: 'Dalton Foundation', primary_contact_name: 'Chris Dalton', account_number: 'SAMPLE-1004', fund_balance: 3_900_000, fund_balance_date: '2026-09-29', voice_pin: '4444' },
];

const g = (grant_id: string, donor_id: string, grant_amount_usd: number, grant_status: string, grantee_name: string, grantee_ein: string, submitted_date: string, approved_date = '', funded_date = ''): Grant =>
  ({ grant_id, donor_id, grant_amount_usd, grant_status, grantee_name, grantee_ein, submitted_date, approved_date, funded_date });

export const grants: Grant[] = [
  // Avery Family Giving Fund: one of every status
  g('G-1001', 'D-01', 100_000, 'PENDING_DD', 'Riverbend Community Health Clinic', '00-1000001', '2026-09-14'),
  g('G-1002', 'D-01', 25_000, 'APPROVED', 'Northside Literacy Project', '00-1000002', '2026-09-08', '2026-09-22'),
  g('G-1003', 'D-01', 5_000, 'FUNDED', 'Harbor Animal Rescue', '00-1000003', '2026-08-29', '2026-09-04', '2026-09-09'),
  g('G-1004', 'D-01', 250_000, 'PENDING_DD', 'Cedar Hills Food Bank', '00-1000004', '2026-09-20'),
  g('G-1005', 'D-01', 10_000, 'DENIED', 'Lakeview Arts Collective', '00-1000005', '2026-08-18'),
  g('G-1006', 'D-01', 40_000, 'CLOSED', 'Mesa Verde Land Trust', '00-1000006', '2026-05-02', '2026-05-20', '2026-06-04'),
  // Shah Family Fund: overdue review, missing documents, compliance-sensitive grantee
  g('G-2001', 'D-02', 40_000, 'PENDING_DD', 'Eastside Youth Soccer League', '00-2000001', '2026-09-10'),
  g('G-2002', 'D-02', 15_000, 'PENDING_DD', 'Bright Futures Tutoring', '00-2000002', '2026-09-16'),
  g('G-2003', 'D-02', 60_000, 'FUNDED', 'Open Arms Shelter', '00-2000003', '2026-08-01', '2026-08-12', '2026-08-20'),
  // Lee Charitable Fund: a single approved grant
  g('G-3001', 'D-03', 12_500, 'APPROVED', 'Westside Music Academy', '00-3000001', '2026-09-02', '2026-09-15'),
  // Dalton Foundation: suspended account
  g('G-4001', 'D-04', 75_000, 'PENDING_DD', 'Coastal Cleanup Alliance', '00-4000001', '2026-09-18'),
];

export const dueDiligence: DueDiligence[] = [
  { grant_id: 'G-1001', review_state: 'IN_REVIEW', queue_position: 12, total_queue_length: 48, typical_review_days: 10, estimated_completion_date: '2026-10-05', escalation_flag: false, escalation_reason: '' },
  { grant_id: 'G-1004', review_state: 'PENDING', queue_position: 30, total_queue_length: 61, typical_review_days: 14, estimated_completion_date: '2026-10-14', escalation_flag: true, escalation_reason: 'Large amount' },
  { grant_id: 'G-2001', review_state: 'IN_REVIEW', queue_position: 8, total_queue_length: 52, typical_review_days: 5, estimated_completion_date: '2026-09-27', escalation_flag: true, escalation_reason: 'Missing docs' },
  { grant_id: 'G-2002', review_state: 'IN_REVIEW', queue_position: 15, total_queue_length: 52, typical_review_days: 5, estimated_completion_date: '2026-10-03', escalation_flag: false, escalation_reason: '' },
  { grant_id: 'G-4001', review_state: 'PENDING', queue_position: 40, total_queue_length: 61, typical_review_days: 14, estimated_completion_date: '2026-10-16', escalation_flag: false, escalation_reason: '' },
];

export const distributions: Distribution[] = [
  { grant_id: 'G-1002', distribution_status: 'SCHEDULED', distribution_date: '2026-10-02', cleared_date: '' },
  { grant_id: 'G-1003', distribution_status: 'CLEARED', distribution_date: '2026-09-09', cleared_date: '2026-09-11' },
  { grant_id: 'G-1006', distribution_status: 'CLEARED', distribution_date: '2026-06-04', cleared_date: '2026-06-06' },
  { grant_id: 'G-2003', distribution_status: 'WIRED', distribution_date: '2026-08-20', cleared_date: '' },
];

export const grantees: Grantee[] = [
  ...grants.map((x) => ({ grantee_ein: x.grantee_ein, organization_name: x.grantee_name, irs_status: 'ACTIVE', sanctions_flag: false })),
].map((e) => (e.grantee_ein === '00-2000002' ? { ...e, irs_status: 'REVOKED' } : e));

export const caseTypes: CaseType[] = [
  { case_type_id: 'CT-1', case_type_name: 'Grant Status Inquiry', escalation_team: 'Grants Services', sla_hours: 24 },
  { case_type_id: 'CT-2', case_type_name: 'Due Diligence Question', escalation_team: 'Grant Review', sla_hours: 8 },
  { case_type_id: 'CT-3', case_type_name: 'Account Update', escalation_team: 'Donor Services', sla_hours: 24 },
];

export const queues: EscalationQueue[] = [
  { queue_name: 'Grants Services', current_availability: 'AVAILABLE', queue_depth: 6 },
  { queue_name: 'Grant Review', current_availability: 'BUSY', queue_depth: 9 },
  { queue_name: 'Donor Services', current_availability: 'AVAILABLE', queue_depth: 4 },
];

/** Donors for the sign-in picker, most grants first. */
export function demoDonors() {
  return donors
    .map((d) => ({ donor: d, grantCount: grants.filter((x) => x.donor_id === d.donor_id).length }))
    .sort((a, b) => b.grantCount - a.grantCount);
}
