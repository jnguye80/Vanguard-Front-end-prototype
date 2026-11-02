// Turns raw tool output into a donor-facing status view. Every sentence here is built only from
// tool-returned fields (grounding rule). Compliance-sensitive detail is withheld (guardrail).

import type { DueDiligence, Grantee } from '../data/types';
import { daysFromToday, fmtDate, fmtMoney, fmtTime, now } from './clock';
import type { GrantStatusView, Role, StatusFact, StatusStep, ToolBundle } from './types';

/** escalation_reason values the donor may hear about, in plain language. Others are internal-only. */
export const PUBLIC_REASON: Record<string, { fact: string; sentence: string; kb: string }> = {
  'Large amount': {
    fact: 'Additional review for large grants',
    sentence: ' Because of its size, it gets an additional level of review. That’s a standard step.',
    kb: 'large amount additional',
  },
  'Missing docs': {
    fact: 'Waiting on documents from the charity',
    sentence: ' The review is waiting on documents from the charity. Our team is in touch with them, so you don’t need to do anything.',
    kb: 'missing documents charity',
  },
};

/** Internal-only flags: never shown to donors. */
export const INTERNAL_REASONS = ['Donor VIP', 'Sanctions review'];

/** Compliance-sensitive grants are never explained through self-service. */
export function sensitivity(grantee?: Grantee, dd?: DueDiligence): string | null {
  if (grantee?.sanctions_flag) return 'grantee sanctions flag';
  if (grantee && grantee.irs_status !== 'ACTIVE') return `grantee IRS status ${grantee.irs_status}`;
  if (dd?.escalation_reason === 'Sanctions review') return 'sanctions review in progress';
  return null;
}

export function statusLabel(status: string, dd?: DueDiligence): { label: string; tone: GrantStatusView['tone'] } {
  switch (status) {
    case 'PENDING_DD':
      return { label: dd?.review_state === 'PENDING' ? 'Waiting for review' : 'In review', tone: 'review' };
    case 'APPROVED': return { label: 'Approved', tone: 'approved' };
    case 'FUNDED': return { label: 'Paid', tone: 'paid' };
    case 'CLOSED': return { label: 'Closed', tone: 'closed' };
    case 'DENIED': return { label: 'Declined', tone: 'declined' };
    default: return { label: status, tone: 'review' };
  }
}

function steps(status: string): StatusStep[] {
  const labels = ['Submitted', 'Charity review', 'Approved', 'Paid'];
  const states: StatusStep['state'][] =
    status === 'PENDING_DD' ? ['done', 'current', 'todo', 'todo']
      : status === 'APPROVED' ? ['done', 'done', 'done', 'current']
        : status === 'DENIED' ? ['done', 'stopped', 'todo', 'todo']
          : ['done', 'done', 'done', 'done'];
  return labels.map((label, i) => ({ label, state: states[i] }));
}

function relative(iso: string) {
  const d = daysFromToday(iso);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d > 1) return `in ${d} days`;
  if (d === -1) return '1 day ago';
  return `${-d} days ago`;
}

export function buildStatusView(b: ToolBundle, role: Role, dd?: DueDiligence): GrantStatusView {
  const g = b.grant!;
  const { label, tone } = statusLabel(g.grant_status, dd);
  const name = g.grantee_name;
  // Advisors can't see amounts, so their sentences name the charity without one.
  const subject = role === 'advisor' ? `The grant to ${name}` : `Your ${fmtMoney(g.grant_amount_usd)} grant to ${name}`;
  const facts: StatusFact[] = [];
  let explanation = '';
  let overdue = false;
  const sensitive = sensitivity(b.grantee, dd);

  if (sensitive) {
    facts.push({ label: 'Status', value: 'In review' });
    facts.push({ label: 'Next step', value: 'A specialist will contact you' });
    explanation = `Your grant to ${name} needs a specialist to review it with you, so I can’t share more detail here. I’ve flagged it for our team.`;
  } else if (g.grant_status === 'PENDING_DD' && dd) {
    const eta = dd.estimated_completion_date;
    overdue = daysFromToday(eta) < 0;
    facts.push({ label: 'Place in queue', value: `#${dd.queue_position} of ${dd.total_queue_length}` });
    facts.push({ label: overdue ? 'Estimated completion (passed)' : 'Estimated completion', value: `${fmtDate(eta)} · ${relative(eta)}`, tone: overdue ? 'warn' : undefined });
    facts.push({ label: 'Typical review time', value: `${dd.typical_review_days} days` });
    const pub = dd.escalation_flag ? PUBLIC_REASON[dd.escalation_reason] : undefined;
    if (pub) facts.push({ label: 'Why', value: pub.fact });
    explanation = `${subject} is ${dd.review_state === 'PENDING' ? 'waiting to start charity review' : 'in charity review now'}. It’s #${dd.queue_position} of ${dd.total_queue_length} in the queue, and reviews like this typically take about ${dd.typical_review_days} days. The current estimate is ${fmtDate(eta)}.`;
    if (pub) explanation += pub.sentence;
    if (overdue) explanation += ' That estimate has passed, so I’d suggest a specialist take a look.';
  } else if (g.grant_status === 'APPROVED') {
    facts.push({ label: 'Approved on', value: fmtDate(g.approved_date) });
    const d = b.distribution;
    let pay = 'Payment is being scheduled.';
    if (d && d.distribution_status === 'WIRED') {
      pay = `It was wired to the charity on ${fmtDate(d.distribution_date)}.`;
      facts.push({ label: 'Payment', value: `Wired ${fmtDate(d.distribution_date)}` });
    } else if (d && ['SCHEDULED', 'PENDING_WIRE'].includes(d.distribution_status)) {
      const future = daysFromToday(d.distribution_date) >= 0;
      pay = future ? `Payment to the charity is scheduled for ${fmtDate(d.distribution_date)}.` : `Payment was scheduled for ${fmtDate(d.distribution_date)} and is being processed.`;
      facts.push({ label: 'Payment', value: `${future ? 'Scheduled' : 'Processing since'} ${fmtDate(d.distribution_date)}` });
    } else {
      facts.push({ label: 'Payment', value: 'Being scheduled' });
    }
    explanation = `${subject} was approved on ${fmtDate(g.approved_date)}. ${pay}`;
  } else if (g.grant_status === 'FUNDED' || g.grant_status === 'CLOSED') {
    facts.push({ label: 'Paid on', value: fmtDate(g.funded_date) });
    const d = b.distribution;
    if (d?.distribution_status === 'CLEARED' && d.cleared_date) facts.push({ label: 'Wire cleared', value: fmtDate(d.cleared_date), tone: 'ok' });
    explanation = g.grant_status === 'CLOSED'
      ? `${subject} is complete. It was paid on ${fmtDate(g.funded_date)}.`
      : `${subject} was paid on ${fmtDate(g.funded_date)}.${d?.distribution_status === 'CLEARED' && d.cleared_date ? ` The wire cleared on ${fmtDate(d.cleared_date)}.` : ''}`;
  } else if (g.grant_status === 'DENIED') {
    facts.push({ label: 'Status', value: 'Declined at charity review' });
    explanation = `${subject} couldn’t be approved. A specialist can explain why and walk you through your options.`;
  }

  facts.unshift({ label: 'Submitted', value: fmtDate(g.submitted_date) });

  const asOfTime = new Date(now().getTime() - b.ageHours * 3_600_000);
  const asOf = b.source.startsWith('gold')
    ? `Data as of ${fmtTime(asOfTime)} today · gold layer`
    : `Live data from ${b.source.replace(' (live)', '')} · gold layer not used`;

  return {
    grant: g,
    statusLabel: label,
    tone,
    steps: steps(g.grant_status),
    facts,
    explanation,
    withheld: !!sensitive,
    sources: [b.source, ...(dd ? ['gold.due_diligence_queue'] : [])],
    asOf,
    overdue,
    citations: [],
    policyLoading: false,
  };
}
