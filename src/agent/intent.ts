// Stand-in for the Bedrock orchestrator's intent step. Rule-based so the demo is deterministic;
// swap for the real model call. Confidence values are illustrative.

import type { Grant } from '../data/types';

export type Intent =
  | 'greeting' | 'thanks' | 'human' | 'expedite' | 'out_of_scope' | 'declined'
  | 'payment' | 'policy' | 'why_pending' | 'list' | 'status' | 'unknown';

export interface Classification {
  intent: Intent;
  confidence: number;
  grantRef?: string;
  wantsOther: boolean;
}

const RULES: [Intent, RegExp, number][] = [
  ['human', /\b(human|person|someone|representative|real agent|call me|speak|talk to|phone)\b/, 0.97],
  ['expedite', /\b(speed|sped|faster|expedite|hurry|rush|asap|urgent|sooner)\b/, 0.92],
  ['out_of_scope', /\b(contribution|contribute|donat|deposit|tax|receipt|statement|invest|balance|stock|transfer|password|login)\w*/, 0.89],
  ['declined', /\b(declin|denied|deny|reject)\w*/, 0.9],
  ['list', /\b(all (of )?my grants|list|show (me )?(all )?my grants|my grants)\b/, 0.9],
  ['policy', /\b(what is|what's|what does|how does|how long does|explain|mean)\b/, 0.86],
  ['payment', /\b(paid|payment|pay|wire|funded|receive|arrive|disburse|money|get the money)\w*/, 0.9],
  ['why_pending', /\b(why|pending|stuck|delay|taking so long|hold ?up|waiting)\b/, 0.93],
  ['status', /\b(status|where|update|check|track|progress|grant|gr-\d+)\b/, 0.94],
  ['thanks', /\b(thank|thanks|thx|great|perfect)\b/, 0.95],
  ['greeting', /^(hi|hello|hey|good (morning|afternoon|evening))\b/, 0.96],
];

const STOP = new Set(['and', 'inc', 'trust', 'fund', 'charities', 'foundation', 'sons', 'ltd', 'group', 'llc', 'the', 'plc', 'co']);

export function classify(text: string, donorGrants: Grant[]): Classification {
  const t = text.toLowerCase();
  const idMatch = t.match(/gr-\d{4}/);
  let grantRef = idMatch ? idMatch[0].toUpperCase() : undefined;
  if (!grantRef) {
    for (const g of donorGrants) {
      const tokens = g.grantee_name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w));
      if (tokens.some((w) => t.includes(w))) { grantRef = g.grant_id; break; }
    }
  }
  const wantsOther = /\b(another|other|different|all)\b/.test(t);
  for (const [intent, re, confidence] of RULES) {
    if (!re.test(t)) continue;
    // "What is the status of GR-5053?" is a status question, not a policy question.
    if (intent === 'policy' && (grantRef || /\b(status|my grant)\b/.test(t))) return { intent: 'status', confidence: 0.9, grantRef, wantsOther };
    return { intent, confidence, grantRef, wantsOther };
  }
  if (grantRef) return { intent: 'status', confidence: 0.8, grantRef, wantsOther };
  return { intent: 'unknown', confidence: 0.41, grantRef, wantsOther };
}
