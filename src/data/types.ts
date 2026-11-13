// Shapes of the sample records the mock agent tools return. They mirror the fields the real grant and
// Salesforce tools are expected to expose, so the UI can later be pointed at the real services unchanged.

export interface DonorProfile {
  donor_id: string;
  account_status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | string;
  account_name: string;
  primary_contact_name: string;
  account_number: string;
  fund_balance: number;
  fund_balance_date: string;
  /** Fictional 4-digit PIN used only to demo voice (IVR) verification. */
  voice_pin: string;
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
}

export interface DueDiligence {
  grant_id: string;
  review_state: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | string;
  queue_position: number;
  total_queue_length: number;
  typical_review_days: number;
  estimated_completion_date: string;
  escalation_flag: boolean;
  escalation_reason: string;
}

export interface Distribution {
  grant_id: string;
  distribution_status: 'SCHEDULED' | 'PENDING_WIRE' | 'WIRED' | 'CLEARED' | string;
  distribution_date: string;
  cleared_date: string;
}

export interface Grantee {
  grantee_ein: string;
  organization_name: string;
  irs_status: 'ACTIVE' | 'INACTIVE' | 'REVOKED' | string;
  sanctions_flag: boolean;
}

export interface CaseType {
  case_type_id: string;
  case_type_name: string;
  escalation_team: string;
  sla_hours: number;
}

export interface EscalationQueue {
  queue_name: string;
  current_availability: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | string;
  queue_depth: number;
}
