import { useEffect, useRef, useState, type FormEvent } from 'react';
import { fmtDate, fmtMoney } from '../agent/clock';
import { runTurn } from '../agent/orchestrator';
import { statusLabel } from '../agent/policy';
import type { TraceEvent } from '../agent/types';
import { demoDonors, dueDiligence, grants } from '../data/load';
import { store, useApp } from '../state/store';
import { Icon } from './Icon';
import { Masked, MessageView } from './MessageView';

export function DonorView() {
  const showTrace = useApp((s) => s.showTrace);
  return (
    <div className="page">
      <AccountSidebar />
      <div className="col-main"><Chat /></div>
      {showTrace && <div className="col-trace"><TracePanel /></div>}
    </div>
  );
}

function AccountSidebar() {
  const donorId = useApp((s) => s.donorId);
  const role = useApp((s) => s.role);
  const busy = useApp((s) => s.busy);
  const donor = demoDonors().find((d) => d.donor.donor_id === donorId)!.donor;
  const mine = grants.filter((g) => g.donor_id === donorId);
  const locked = role === 'family';
  return (
    <aside className="col-side" aria-label="Account summary">
      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <span className="small muted">Signed in as {role === 'holder' ? `${donor.primary_contact_name} · Account holder` : role === 'advisor' ? 'Sam Ortiz · Advisor (stand-in)' : 'Taylor · Family member (stand-in)'}</span>
          <h1 className="acct-name">{donor.account_name}</h1>
          <span className="small muted">{donor.vc_account_number} · {donor.donor_id} · </span>
          <span className={`pill ${donor.account_status === 'ACTIVE' ? 'pill-paid' : 'pill-review'}`} style={{ fontSize: 11, padding: '1px 8px' }}>{donor.account_status}</span>
        </div>
        <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          <div className="small muted">Fund balance (as of {fmtDate(donor.fund_balance_date)})</div>
          <div className="balance">{role === 'holder' ? fmtMoney(donor.vc_fund_balance) : 'Restricted'}</div>
        </div>
      </section>
      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="h2">Your grants ({mine.length})</h2>
        {locked ? (
          <div className="notice" style={{ padding: 10, fontSize: 13 }}><Icon name="lock" /> Grant details are visible to the account holder and people they give access to.</div>
        ) : (
          <ul className="grant-list">
            {mine.map((g) => {
              const st = statusLabel(g.grant_status, dueDiligence.find((d) => d.grant_id === g.grant_id));
              return (
                <li key={g.grant_id}>
                  <button type="button" className="grant-row" disabled={busy}
                    onClick={() => { store.set((s) => ({ memory: { ...s.memory, pendingIntent: 'status' } })); runTurn({ type: 'pick_grant', grantId: g.grant_id, label: `Tell me about my grant to ${g.grantee_name}` }); }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span className="grant-name">{g.grantee_name}</span>
                      <span className="small muted">{role === 'advisor' ? <Masked /> : fmtMoney(g.grant_amount_usd, true)} · {g.grant_id}</span>
                    </span>
                    <span className={`pill pill-${st.tone}`}>{st.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <span className="small muted">Click a grant to ask the assistant about it.</span>
      </section>
    </aside>
  );
}

function roleLabel(r: string) {
  return r === 'holder' ? 'Account holder' : r === 'advisor' ? 'Advisor' : 'Family member';
}

function Chat() {
  const messages = useApp((s) => s.messages);
  const suggestions = useApp((s) => s.suggestions);
  const busy = useApp((s) => s.busy);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Chips and picker buttons are removed or disabled while the assistant works. If keyboard focus was on
  // one of them, it falls back to <body>; return it to the message box so the user keeps their place.
  useEffect(() => {
    if (!busy && (document.activeElement === document.body || document.activeElement === null)) {
      inputRef.current?.focus();
    }
  }, [busy]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t || busy) return;
    setDraft('');
    runTurn({ type: 'text', text: t });
  };

  return (
    <section className="card chat" aria-label="Grants assistant">
      <div className="chat-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="avatar" aria-hidden="true">M</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Grants assistant</h2>
            <span className="small muted">AI assistant · answers grant questions only</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={busy} onClick={() => runTurn({ type: 'text', text: 'Talk to a person' })}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="phone" size={14} />Talk to a person</span>
          </button>
        </div>
      </div>
      <div className="log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation" tabIndex={0}>
        {messages.map((m) => <MessageView key={m.id} m={m} />)}
        {busy && (
          <div className="row-agent" role="status" aria-label="Assistant is working">
            <span className="avatar" aria-hidden="true">M</span>
            <div className="bubble-agent typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      <div className="chips">
        {suggestions.map((c) => (
          <button key={c.label} type="button" className="chip" disabled={busy} onClick={() => runTurn(c.input)}>{c.label}</button>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <label htmlFor="msg" className="sr-only">Message the grants assistant</label>
        <input id="msg" ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about a grant… e.g. “Why is my grant pending?”" autoComplete="off" />
        <button type="submit" className="send" aria-label="Send" disabled={busy || !draft.trim()}><Icon name="send" size={18} width={2.2} /></button>
      </form>
      <p className="disclaimer">Answers come from your grant records and approved policy. The assistant can’t move money or change a grant.</p>
    </section>
  );
}

const PHASES: { key: TraceEvent['phase']; label: string }[] = [
  { key: 'understand', label: 'Understand' },
  { key: 'reason', label: 'Reason' },
  { key: 'act', label: 'Act' },
  { key: 'remember', label: 'Remember' },
];

const DOT: Record<string, string> = {
  auth: '#8fb3e8', intent: '#8fb3e8', tool: '#5fb49c', kb: '#c3a6f0', guard: '#e8b86b',
  fallback: '#e8b86b', fail: '#f08a7e', write: '#7fd1c1', memory: '#9fb2ba',
};
const TAG: Record<string, string> = {
  auth: 'AUTH', intent: 'INTENT', tool: 'READ', kb: 'KB', guard: 'GUARD', fallback: 'FALLBACK', fail: 'STOP', write: 'WRITE', memory: 'MEMORY',
};

function TracePanel() {
  const trace = useApp((s) => s.trace);
  const latest = useApp((s) => s.turn);
  const role = useApp((s) => s.role);
  const scenario = useApp((s) => s.scenario);
  const [pinned, setPinned] = useState<number | null>(null);
  const turn = pinned ?? latest;
  const events = trace.filter((e) => e.turn === turn);
  const total = events.reduce((n, e) => n + (e.ms ?? 0), 0);
  const usedGrants = events.some((e) => ['tool', 'kb', 'write', 'fallback'].includes(e.kind));
  const grantsActive = latest === 0 || usedGrants;

  return (
    <aside className="trace" aria-label="Under the hood: agent trace">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <h2>Under the hood</h2>
          <span className="tmuted">Live agent trace · Bedrock orchestrator (simulated)</span>
        </div>
        {latest > 0 && (
          <div className="turn-nav">
            <button type="button" aria-label="Previous turn" disabled={turn <= 1} onClick={() => setPinned(Math.max(1, turn - 1))}>‹</button>
            <span>Turn {turn}/{latest}</span>
            <button type="button" aria-label="Next turn" disabled={turn >= latest} onClick={() => setPinned(turn + 1 >= latest ? null : turn + 1)}>›</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="trace-label">Agents</span>
        <div className="agents">
          <span className="agent-chip active">Orchestrator · active</span>
          <span className={`agent-chip ${grantsActive ? 'active' : ''}`}>Grants agent · {grantsActive ? 'active' : 'idle'}</span>
          <span className="agent-chip future">DAF agent · future phase</span>
          <span className="agent-chip future">Transactions agent · future phase</span>
        </div>
      </div>
      {events.length === 0 ? (
        <p className="trace-empty">Send a message to watch the orchestrator understand, reason, act and remember, step by step.</p>
      ) : (
        PHASES.map((p) => {
          const list = events.filter((e) => e.phase === p.key);
          if (!list.length) return null;
          return (
            <div className="phase" key={p.key}>
              <span className="phase-name">{p.label}</span>
              <ul className="events">{list.map((e) => <TraceRow key={e.id} e={e} />)}</ul>
            </div>
          );
        })
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="trace-label">Governance</span>
        <ul className="gov">
          {[
            'PII redaction · on',
            `Authorization · ${roleLabel(role)}`,
            'Guardrails · grounded answers only',
            auditLine(events.filter((e) => ['tool', 'kb', 'write'].includes(e.kind)).length),
          ].map((t) => (
            <li key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="check" size={14} stroke="#5fb49c" width={2.4} />{t}</li>
          ))}
        </ul>
      </div>
      <div className="trace-foot">
        {events.length > 0 && <>Turn total {total >= 1000 ? `${(total / 1000).toFixed(1)} s` : `${total} ms`} · </>}
        Scenario: {scenario === 'normal' ? 'gold layer fresh' : scenario === 'stale' ? 'gold layer stale (6.2 h)' : scenario === 'athena_down' ? 'Athena down' : 'all grant sources down'}
      </div>
    </aside>
  );
}

function auditLine(n: number) {
  return `Audit · ${n} row${n === 1 ? '' : 's'} written to sf_tasks`;
}

function TraceRow({ e }: { e: TraceEvent }) {
  const [open, setOpen] = useState(false);
  const color = e.status === 'fail' ? '#f08a7e' : e.status === 'warn' ? '#e8b86b' : DOT[e.kind];
  return (
    <li className="event">
      <span className={`event-dot ${e.status === 'running' ? 'running' : ''}`} style={e.status === 'running' ? undefined : { background: color }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span><span className="event-tag">{e.status === 'fail' ? 'FAIL' : TAG[e.kind]}</span><span className="event-label">{e.label}</span></span>
        <span className="event-detail">{e.detail}</span>
        {e.sql && (
          <>
            <button type="button" className="sql-toggle" aria-expanded={open} onClick={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }}>{open ? 'Hide query' : 'Show query'}</button>
            {open && <pre className="sql">{e.sql}</pre>}
          </>
        )}
      </span>
      <span className="event-ms">{e.status === 'running' ? '…' : e.ms !== undefined ? (e.ms >= 1000 ? `${(e.ms / 1000).toFixed(1)} s` : `${e.ms} ms`) : ''}</span>
    </li>
  );
}
