// Input PII guardrail (stand-in for Bedrock Guardrails sensitive-information filters).
// Runs before anything else sees the donor's message: the chat, the trace, the rep transcript and the
// "model" only ever receive the redacted text. The assistant never needs these details to answer.

export interface PiiFinding { type: string; label: string }

const PATTERNS: { type: string; label: string; re: RegExp; token: string }[] = [
  // Order matters: specific shapes first, so a card number isn't half-matched as a phone number.
  { type: 'card', label: 'card number', re: /\b(?:\d[ -]?){12,18}\d\b/g, token: '[card number removed]' },
  { type: 'ssn', label: 'Social Security number', re: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, token: '[SSN removed]' },
  { type: 'email', label: 'email address', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, token: '[email removed]' },
  { type: 'phone', label: 'phone number', re: /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g, token: '[phone number removed]' },
  { type: 'account', label: 'bank or account number', re: /(?<![\w-])\d{8,17}(?![\w-])/g, token: '[account number removed]' },
];

export function redactPii(text: string): { text: string; findings: PiiFinding[] } {
  let out = text;
  const findings: PiiFinding[] = [];
  for (const p of PATTERNS) {
    out = out.replace(p.re, () => {
      findings.push({ type: p.type, label: p.label });
      return p.token;
    });
  }
  return { text: out, findings };
}

/** "your Social Security number and a phone number" */
export function describeFindings(findings: PiiFinding[]): string {
  const labels = [...new Set(findings.map((f) => f.label))];
  if (labels.length === 1) return `your ${labels[0]}`;
  return `your ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Output check: the reply must not contain PII patterns either. */
export function containsPii(text: string): boolean {
  return PATTERNS.some((p) => new RegExp(p.re.source).test(text));
}
