// Golden-set routing check. Every question in src/agent/questions.ts must route to the intent, toolset and
// domain it expects. When Vanguard Charitable's golden question set arrives, add it to QUESTIONS and this
// test tells you which questions the assistant doesn't handle yet.

import { expect, test } from '@playwright/test';
import { grants } from '../src/data/sample';
import { classify } from '../src/agent/intent';
import { QUESTIONS } from '../src/agent/questions';

const donorGrants = grants.filter((g) => g.donor_id === 'D-01');

for (const q of QUESTIONS) {
  test(`routes: ${q.q}`, () => {
    const c = classify(q.q, donorGrants);
    expect({ intent: c.intent, toolset: c.toolset, domain: c.domain }).toEqual({ intent: q.intent, toolset: q.toolset, domain: q.domain });
  });
}
