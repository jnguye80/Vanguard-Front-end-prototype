// Stand-in for the orchestrator's intent step. Rule-based so the demo is deterministic; swap for the real
// model call. Confidence values are illustrative.
//
// Routing model (from the kickoff review): one orchestrator, many agents, each with several toolsets.
// The MVP has one agent (Grants) with four live toolsets; Submissions and every other business domain are
// future work, so those questions get a generic reply and a hand-off to a person.

import type { Grant } from '../data/types';

export type Intent =
  | 'greeting' | 'thanks' | 'human' | 'expedite' | 'out_of_scope' | 'declined' | 'submission'
  | 'payment' | 'policy' | 'why_pending' | 'list' | 'status' | 'unknown';

/** Toolsets inside the Grants agent. `submissions` is planned, not built. */
export type Toolset = 'grant_status' | 'due_diligence' | 'disbursements' | 'grant_policy' | 'submissions';

/** Business domains the orchestrator may route to. Only `grants` has an agent in the MVP. */
export type Domain = 'grants' | 'contributions' | 'investments' | 'tax_statements' | 'account' | 'other';

export const TOOLSETS: { key: Toolset; label: string; live: boolean }[] = [
  { key: 'grant_status', label: 'Grant status', live: true },
  { key: 'due_diligence', label: 'Due diligence', live: true },
  { key: 'disbursements', label: 'Disbursements', live: true },
  { key: 'grant_policy', label: 'Grant policy', live: true },
  { key: 'submissions', label: 'Submissions', live: false },
];

export const FUTURE_DOMAINS: { key: Exclude<Domain, 'grants' | 'other'>; label: string; reply: string }[] = [
  { key: 'contributions', label: 'Contributions', reply: 'contributions' },
  { key: 'investments', label: 'Investments', reply: 'investments and balances' },
  { key: 'tax_statements', label: 'Tax & statements', reply: 'tax receipts and statements' },
  { key: 'account', label: 'Account services', reply: 'account settings' },
];

export interface Classification {
  intent: Intent;
  confidence: number;
  grantRef?: string;
  wantsOther: boolean;
  toolset?: Toolset;
  domain: Domain;
}

const RULES: [Intent, RegExp, number][] = [
  ['human', /\b(human|person|someone|representative|real agent|call me|speak to|talk to|phone call)\b/, 0.97],
  ['submission', /\b(submit|new grant|make a grant|recommend a grant|start a grant|cancel|change (my|the|a) grant|edit (my|the) grant|recurring grant|schedule a grant|grant request|how do i (give|grant|recommend))\b/, 0.9],
  ['expedite', /\b(speed|sped|faster|expedite|hurry|rush|asap|urgent|sooner)\b/, 0.92],
  ['out_of_scope', /\b(contribut\w*|donat\w*|deposit\w*|tax\w*|receipt\w*|statement\w*|1099|invest\w*|portfolio|balance|stock\w*|transfer\w*|password|log ?in|address|beneficiar\w*|successor\w*)\b/, 0.89],
  ['declined', /\b(declin|denied|deny|reject)\w*/, 0.9],
  ['list', /\b(all (of )?my grants|list|show (me )?(all )?my grants|my grants)\b/, 0.9],
  ['policy', /\b(what is|what's|what does|how does|how long does|explain|mean)\b/, 0.86],
  ['payment', /\b(paid|payment|pay|wire|funded|receive|arrive|disburse|money|get the money)\w*/, 0.9],
  ['why_pending', /\b(why|pending|stuck|delay|taking so long|hold ?up|waiting)\b/, 0.93],
  ['status', /\b(status|where|update|check|track|progress|grant|g-\d+)\b/, 0.94],
  ['thanks', /\b(thank|thanks|thx|great|perfect)\b/, 0.95],
  ['greeting', /^(hi|hello|hey|good (morning|afternoon|evening))\b/, 0.96],
];

const DOMAIN_RULES: [Domain, RegExp][] = [
  ['tax_statements', /\b(tax\w*|receipt\w*|statement\w*|1099|deduct\w*)\b/],
  ['contributions', /\b(contribut\w*|donat\w*|deposit\w*|transfer\w*)\b/],
  ['investments', /\b(invest\w*|portfolio|balance|stock\w*|returns?)\b/],
  ['account', /\b(password|log ?in|address|beneficiar\w*|successor\w*|profile)\b/],
];

const TOOLSET_FOR: Partial<Record<Intent, Toolset>> = {
  status: 'grant_status', list: 'grant_status', declined: 'grant_status',
  why_pending: 'due_diligence', expedite: 'due_diligence',
  payment: 'disbursements',
  policy: 'grant_policy',
  submission: 'submissions',
};

const STOP = new Set(['and', 'inc', 'trust', 'fund', 'charities', 'foundation', 'sons', 'ltd', 'group', 'llc', 'the', 'plc', 'co']);

export function classify(text: string, donorGrants: Grant[]): Classification {
  const t = text.toLowerCase();
  const idMatch = t.match(/\bg-\d{4}\b/);
  let grantRef = idMatch ? idMatch[0].toUpperCase() : undefined;
  if (!grantRef) {
    for (const g of donorGrants) {
      const tokens = g.grantee_name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w));
      if (tokens.some((w) => t.includes(w))) { grantRef = g.grant_id; break; }
    }
  }
  const wantsOther = /\b(another|other|different|all)\b/.test(t);
  const done = (intent: Intent, confidence: number): Classification => ({
    intent, confidence, grantRef, wantsOther,
    toolset: TOOLSET_FOR[intent],
    domain: intent === 'out_of_scope' ? (DOMAIN_RULES.find(([, re]) => re.test(t))?.[0] ?? 'other') : 'grants',
  });
  for (const [intent, re, confidence] of RULES) {
    if (!re.test(t)) continue;
    // "What is the status of G-1004?" is a status question, not a policy question.
    if (intent === 'policy' && (grantRef || /\b(status|my grant)\b/.test(t))) return done('status', 0.9);
    return done(intent, confidence);
  }
  if (grantRef) return done('status', 0.8);
  return done('unknown', 0.41);
}

export function toolsetLabel(t?: Toolset) {
  return TOOLSETS.find((x) => x.key === t)?.label ?? '';
}

export function domainLabel(d: Domain) {
  return FUTURE_DOMAINS.find((x) => x.key === d)?.label ?? 'Other';
}
