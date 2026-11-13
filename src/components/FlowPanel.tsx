import { useState } from 'react';
import { contract } from '../agent/contract';
import type { Exchange } from '../agent/types';
import { useApp } from '../state/store';

// "How this question was handled": the same five steps for chat and voice. The JSON view is the shape of
// the lightweight Q&A contract between the channel (Amazon Connect) and the grants agent.

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

interface Step { n: number; title: string; question: string; status: string; tone: Tone; detail: string }

function steps(e: Exchange | undefined, channel: 'chat' | 'voice'): Step[] {
  const ch = channel === 'chat' ? 'Chat' : 'Voice call';
  if (!e) {
    return [
      { n: 1, title: 'Channel', question: 'How did the question arrive?', status: ch, tone: 'idle', detail: channel === 'chat' ? 'Typed in the chat window' : 'Spoken, or entered on the keypad' },
      { n: 2, title: 'Personal data guardrail', question: 'Is there anything we shouldn’t keep?', status: 'Waiting', tone: 'idle', detail: 'SSN, card, bank, email and phone numbers are removed before anything else sees the message' },
      { n: 3, title: 'Authentication', question: 'Who is asking?', status: 'Not verified', tone: 'idle', detail: `${channel === 'chat' ? 'Donor ID typed in chat' : 'Donor ID, then a PIN, on the keypad'}. Or continue without verifying.` },
      { n: 4, title: 'Authorization', question: 'What may they see?', status: 'Waiting', tone: 'idle', detail: 'Verified: only grants on their own account. Not verified: general grant information only.' },
      { n: 5, title: 'Answer', question: 'What did the assistant do?', status: 'Waiting', tone: 'idle', detail: 'Answer from grant records and policy, give a generic reply, or hand off to a person' },
    ];
  }
  const a = e.authentication;
  const z = e.authorization;
  const r = e.routing;
  const notVerified = a.status === 'guest' || a.status === 'locked';
  const needsVerify = notVerified && z.status === 'blocked';
  const answerStatus = { answered: notVerified ? 'General answer' : 'Answered', sign_in: notVerified ? 'Not verified' : 'Waiting for sign-in', generic: needsVerify ? 'Needs verification' : 'Generic reply', handoff: e.handoff?.mode === 'transfer' ? 'Transferred to a person' : 'Handed to a person' }[e.outcome];
  const answerDetail = needsVerify
    ? (a.status === 'locked' ? 'Account details need verification; offered a person who can verify them' : 'Asked to verify first; the question is kept and answered right after')
    : e.outcome === 'handoff' && e.handoff
    ? `Case ${e.handoff.caseId} · ${e.handoff.team} · reply within ${e.handoff.responseHours} h`
    : e.outcome === 'sign_in'
      ? (a.status === 'verified' ? 'Verified. Ready for the question.' : notVerified ? 'Continues with general questions only; can verify or ask for a person at any time' : 'The question waits until the donor is verified')
      : e.sources.length ? `From: ${e.sources.join('; ')}` : r && !r.live ? `${r.agent} isn’t built yet` : 'No account data used';
  return [
    { n: 1, title: 'Channel', question: 'How did the question arrive?', status: ch, tone: 'ok', detail: `“${e.question}”` },
    {
      n: 2, title: 'Personal data guardrail', question: 'Is there anything we shouldn’t keep?',
      status: e.piiRemoved.length ? 'Removed' : 'Nothing found', tone: e.piiRemoved.length ? 'warn' : 'ok',
      detail: e.piiRemoved.length ? `Removed: ${e.piiRemoved.join(', ')}. Only the cleaned text is kept.` : 'Reply also checked on the way out',
    },
    {
      n: 3, title: 'Authentication', question: 'Who is asking?',
      status: a.status === 'verified' ? `Verified · ${a.donorId}` : a.status === 'locked' ? 'Locked' : a.status === 'guest' ? 'Not verified (guest)' : a.status === 'failed' ? 'Failed' : a.donorId ? 'PIN needed' : 'Not verified',
      tone: a.status === 'verified' ? 'ok' : a.status === 'locked' ? 'bad' : 'warn',
      detail: `${a.method}. ${a.detail}.`,
    },
    {
      n: 4, title: 'Authorization', question: 'What may they see?',
      status: z.status === 'allowed' ? 'Allowed' : z.status === 'blocked' ? 'Blocked' : z.status === 'limited' ? 'General info only' : 'Not needed',
      tone: z.status === 'allowed' ? 'ok' : z.status === 'blocked' ? 'bad' : z.status === 'limited' ? 'warn' : 'idle',
      detail: z.detail,
    },
    {
      n: 5, title: 'Answer', question: r ? `${r.agent}${r.toolset ? ` › ${r.toolset}` : ''}${r.live ? '' : ' (future)'}` : 'What did the assistant do?',
      status: answerStatus, tone: e.outcome === 'answered' ? 'ok' : e.outcome === 'handoff' ? 'ok' : e.outcome === 'generic' ? 'warn' : 'idle',
      detail: answerDetail,
    },
  ];
}

export function FlowPanel() {
  const exchange = useApp((s) => s.exchange);
  const channel = useApp((s) => s.channel);
  const busy = useApp((s) => s.busy);
  const [showJson, setShowJson] = useState(false);
  const list = steps(exchange, channel);

  return (
    <aside className="card card-pad flow" aria-labelledby="flow-title">
      <div>
        <h2 id="flow-title" className="h2">How this question was handled</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          {exchange ? `Your last message${busy ? ' (in progress)' : ''}.` : 'Ask a question to see each step.'} Same steps for chat and voice.
        </p>
      </div>
      <ol className="flow-steps">
        {list.map((s) => (
          <li key={s.n} className={`flow-step tone-${s.tone}`}>
            <span className="flow-n" aria-hidden="true">{s.n}</span>
            <div className="flow-body">
              <div className="flow-top">
                <span className="flow-title">{s.title}</span>
                <span className={`flow-status tone-${s.tone}`}>{s.status}</span>
              </div>
              <span className="flow-q">{s.question}</span>
              <span className="flow-detail">{s.detail}</span>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <button type="button" className="btn" aria-expanded={showJson && !!exchange} aria-controls="contract" disabled={!exchange} onClick={() => setShowJson(!showJson)}>
          {showJson && exchange ? 'Hide' : 'Show'} the Q&amp;A contract (JSON)
        </button>
        {showJson && exchange && (
          <pre id="contract" className="contract" tabIndex={0} aria-label="Q&A contract for the last message">{JSON.stringify(contract(exchange), null, 2)}</pre>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Simulated agent · fictional sample data · nothing is stored or sent. Authorization beyond “own grants only” is future work.</p>
    </aside>
  );
}
