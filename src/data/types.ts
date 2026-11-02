// Row types for the synthetic gold-layer tables (see /docs/schema in the client's data model PDF).

export interface DonorProfile {
  donor_id: string;
  account_status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | string;
  account_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  vc_account_number: string;
  vc_fund_balance: number;
  fund_balance_date: string;
}

export type GrantStatus = 'PENDING_DD' | 'APPROVED' | 'FUNDED' | 'CLOSED' | 'DENIED';

export interface Grant {
  grant_id: string;
  donor_id: string;
  grant_amount_usd: number;
  grant_status: GrantStatus | string;
  grantee_name: string;
  grantee_ein: string;
  submitted_date: string;
  approved_date: string;
  funded_date: string;
  last_modified: string;
  load_date: string;
}

export interface DueDiligence {
  grant_id: string;
  donor_id: string;
  review_state: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | string;
  queue_position: number;
  total_queue_length: number;
  typical_review_days: number;
  estimated_completion_date: string;
  review_notes: string;
  escalation_flag: boolean;
  escalation_reason: string;
  last_modified: string;
  load_date: string;
}

export interface Distribution {
  distribution_id: string;
  grant_id: string;
  donor_id: string;
  distribution_status: 'SCHEDULED' | 'PENDING_WIRE' | 'WIRED' | 'CLEARED' | string;
  distribution_amount: number;
  distribution_date: string;
  cleared_date: string;
  wire_reference: string;
}

export interface Grantee {
  grantee_ein: string;
  organization_name: string;
  irs_status: 'ACTIVE' | 'INACTIVE' | 'REVOKED' | string;
  sanctions_flag: boolean;
  sanctions_reason: string;
}

export interface CaseType {
  case_type_id: string;
  case_type_name: string;
  escalation_team: string;
  sla_hours: number;
}

export interface EscalationQueue {
  queue_id: string;
  queue_name: string;
  current_availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | string;
  queue_depth: number;
  avg_handle_time_min: number;
}

export interface Task {
  task_id: string;
  grant_id: string;
  donor_id: string;
  task_type: string;
  task_status: 'PENDING' | 'COMPLETED' | 'FAILED' | string;
  created_by_agent: boolean;
  agent_name: string;
  result_summary: string;
  execution_time_ms: number;
  error_message: string;
  created_at: string;
  isNew?: boolean;
}
