// STARTER QUESTION SET, written by the CIC team to frame the toolset.
// Replace or extend with Vanguard Charitable's golden question set (Sugu) when it arrives: keep the same
// shape and `npm test` checks every question routes where `expect` says.

import type { Domain, Intent, Toolset } from './intent';

export type Outcome = 'answered' | 'generic' | 'handoff';

export interface Question {
  q: string;
  intent: Intent;
  toolset?: Toolset;
  domain: Domain;
  outcome: Outcome;
  note: string;
}

const grants = (q: string, intent: Intent, toolset: Toolset | undefined, outcome: Outcome, note: string): Question =>
  ({ q, intent, toolset, domain: 'grants', outcome, note });
const outside = (q: string, domain: Domain, note: string): Question =>
  ({ q, intent: 'out_of_scope', domain, outcome: 'generic', note });

export const QUESTIONS: Question[] = [
  // Grants agent · Grant status
  grants('Where’s my grant?', 'status', 'grant_status', 'answered', 'Lists open grants to pick from, then shows the status card.'),
  grants('What is the status of G-1004?', 'status', 'grant_status', 'answered', 'Goes straight to the grant by its ID.'),
  grants('Show all my grants', 'list', 'grant_status', 'answered', 'Every grant on the signed-in account.'),
  grants('Was my grant to Lakeview declined?', 'declined', 'grant_status', 'answered', 'Confirms the decline; reasons only come from a specialist.'),
  // Grants agent · Due diligence
  grants('Why is my grant pending?', 'why_pending', 'due_diligence', 'answered', 'Queue position, estimate and the policy that explains the review.'),
  grants('Why is the Cedar Hills grant taking so long?', 'why_pending', 'due_diligence', 'answered', 'Explains the extra review for large grants.'),
  grants('Can this be sped up?', 'expedite', 'due_diligence', 'handoff', 'The assistant can’t change review timelines, so it opens a case.'),
  // Grants agent · Disbursements
  grants('When will the charity get paid?', 'payment', 'disbursements', 'answered', 'Payment date for approved grants, wire date for paid ones.'),
  grants('Has the Harbor Animal Rescue grant been paid?', 'payment', 'disbursements', 'answered', 'Paid date and when the wire cleared.'),
  // Grants agent · Grant policy (knowledge base)
  grants('What is due diligence?', 'policy', 'grant_policy', 'answered', 'Answer quoted from approved policy content, with its source.'),
  grants('What does charity verification mean?', 'policy', 'grant_policy', 'answered', 'Answer quoted from approved policy content, with its source.'),
  // Grants agent · Submissions (future toolset)
  grants('How do I submit a new grant?', 'submission', 'submissions', 'generic', 'Submissions toolset is planned: generic reply and an offer to talk to a person.'),
  grants('Can I cancel my grant to Riverbend?', 'submission', 'submissions', 'generic', 'Changing or cancelling grants isn’t possible in chat yet.'),
  // Hand-off
  grants('Can I talk to a person?', 'human', undefined, 'handoff', 'Chat: opens a case with the conversation. Voice: transfers the call to a specialist.'),
  // Outside grants: future agents
  outside('Where’s my contribution?', 'contributions', 'Contributions agent is future work: generic reply and hand-off.'),
  outside('How are my investments doing?', 'investments', 'Investments agent is future work: generic reply and hand-off.'),
  outside('Can I get my tax receipt?', 'tax_statements', 'Tax & statements agent is future work: generic reply and hand-off.'),
  outside('How do I reset my password?', 'account', 'Account services agent is future work: generic reply and hand-off.'),
];
