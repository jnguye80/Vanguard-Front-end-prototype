// Stand-in for the Amazon Bedrock Knowledge Base (approved grants-domain content).
// SAMPLE CONTENT ONLY — replace with Vanguard Charitable's approved policy text before any external demo.

export interface KbPassage {
  id: string;
  title: string;
  section: string;
  text: string;
  keywords: string[];
}

export const KB: KbPassage[] = [
  {
    id: 'kb-dd-overview',
    title: 'Grant policy',
    section: 'Due diligence overview',
    text: 'Before a grant is paid, the charity is reviewed to confirm it is eligible to receive grants. Reviews are handled in the order they are received, and each grant moves through the queue until it is approved.',
    keywords: ['due diligence', 'review', 'pending', 'queue', 'why', 'stuck', 'delay', 'long', 'eligible'],
  },
  {
    id: 'kb-irs',
    title: 'Grant policy',
    section: 'Charity verification',
    text: 'Grants are paid only to organizations verified as eligible public charities. Eligibility is confirmed against IRS data before a grant is approved.',
    keywords: ['irs', 'verification', 'verify', '501', 'charity', 'eligible', 'eligibility'],
  },
  {
    id: 'kb-large',
    title: 'Grant policy',
    section: 'Additional review for large grants',
    text: 'Grants above a set threshold receive an additional level of review before approval. This is a standard step and does not mean anything is wrong with the grant.',
    keywords: ['large', 'amount', 'additional', 'extra', 'big'],
  },
  {
    id: 'kb-docs',
    title: 'Grant policy',
    section: 'Documents from the charity',
    text: 'Sometimes a review needs documents from the charity before it can finish. Our team contacts the charity directly; the donor does not need to take action.',
    keywords: ['documents', 'docs', 'missing', 'paperwork', 'charity'],
  },
  {
    id: 'kb-payment',
    title: 'Grant policy',
    section: 'How approved grants are paid',
    text: 'After approval, a payment is scheduled and sent to the charity by wire. A wire is marked cleared once the receiving bank confirms it.',
    keywords: ['paid', 'payment', 'wire', 'cleared', 'funded', 'receive', 'arrive', 'when', 'money'],
  },
  {
    id: 'kb-expedite',
    title: 'Service policy',
    section: 'Requests to speed up a review',
    text: 'Review timelines cannot be shortened through self-service. A Grants specialist can look at the review and follow up with the donor.',
    keywords: ['speed', 'faster', 'expedite', 'rush', 'urgent', 'hurry'],
  },
  {
    id: 'kb-declined',
    title: 'Service policy',
    section: 'Declined grants',
    text: 'When a grant cannot be approved, a specialist explains the reason and the donor’s options. Reasons are not shared through self-service.',
    keywords: ['declined', 'denied', 'rejected', 'decline'],
  },
];

export function searchKb(query: string, k = 2): { passage: KbPassage; score: number }[] {
  const q = query.toLowerCase();
  return KB.map((p) => ({
    passage: p,
    score: p.keywords.reduce((s, kw) => (q.includes(kw) ? s + 1 : s), 0),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => ({ ...r, score: Math.min(0.99, 0.55 + r.score * 0.12) }));
}
