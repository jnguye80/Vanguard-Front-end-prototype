import { useState } from 'react';
import { fmtDate, fmtMoney } from '../agent/clock';
import { runTurn } from '../agent/orchestrator';
import type { AgentMessage, GrantStatusView } from '../agent/types';
import { store, useApp } from '../state/store';
import { Icon } from './Icon';

export function MessageView({ m }: { m: AgentMessage }) {
  if (m.role === 'user') {
    return <div className="row-user msg-in"><div className="bubble-user">{m.text}</div></div>;
  }
  return (
    <div className="row-agent msg-in">
      <span className="avatar" aria-hidden="true">M</span>
      <div className="agent-body">{renderAgent(m)}</div>
    </div>
  );
}

function renderAgent(m: Exclude<AgentMessage, { role: 'user' }>) {
  switch (m.kind) {
    case 'text': return <div className="bubble-agent">{m.text}</div>;
    case 'grant_picker': return <GrantPicker m={m} />;
    case 'grant_status': return <StatusCard view={m.view} />;
    case 'kb_answer': return <KbAnswer m={m} />;
    case 'notice': return <Notice m={m} />;
    case 'handoff': return <HandoffCard m={m} />;
  }
}

function GrantPicker({ m }: { m: Extract<AgentMessage, { kind: 'grant_picker' }> }) {
  const busy = useApp((s) => s.busy);
  return (
    <div className="mcard picker">
      <div className="picker-head">{m.prompt}</div>
      {m.grants.map(({ grant: g, statusLabel, tone }) => (
        <button key={g.grant_id} type="button" disabled={busy}
          onClick={() => runTurn({ type: 'pick_grant', grantId: g.grant_id, label: `${g.grantee_name} · ${fmtMoney(g.grant_amount_usd)}` })}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{g.grantee_name}</span>
            <span className="small muted">{fmtMoney(g.grant_amount_usd)} · {g.grant_id} · submitted {fmtDate(g.submitted_date)}</span>
          </span>
          <span className={`pill pill-${tone}`}>{statusLabel}</span>
        </button>
      ))}
    </div>
  );
}

export function StatusCard({ view: v, compact = false }: { view: GrantStatusView; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const passage = v.citations.find((c) => c.id === open);
  return (
    <div className="mcard">
      <div className="status-top">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="small muted">Grant {v.grant.grant_id}</span>
          <span className="amount">{fmtMoney(v.grant.grant_amount_usd)}</span>
          <span style={{ fontSize: 14 }}>to {v.grant.grantee_name}</span>
        </div>
        <span className={`pill pill-${v.tone}`}>{v.statusLabel}</span>
      </div>
      <ol className="tracker" aria-label="Grant progress">
        {v.steps.map((s) => (
          <li key={s.label}>
            <span className={`bar ${s.state}`} />
            <span className={`step-label ${s.state === 'todo' ? 'todo' : ''}`}>{s.label}</span>
            <span className="step-sub">{s.state === 'done' ? 'Done' : s.state === 'current' ? 'Current' : s.state === 'stopped' ? 'Stopped' : 'Upcoming'}</span>
          </li>
        ))}
      </ol>
      <dl className="facts">
        {v.facts.map((f) => (
          <div key={f.label}><dt>{f.label}</dt><dd className={f.tone}>{f.value}</dd></div>
        ))}
      </dl>
      {v.withheld && (
        <div className="notice" style={{ padding: 10 }}>
          <Icon name="lock" />
          <span className="small">Some details on this grant can only be discussed with a specialist.</span>
        </div>
      )}
      <p className="explain">{v.explanation}</p>
      {!compact && (
        <>
          {v.policyLoading && (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="small muted">Checking grant policy…</span>
              <span className="skeleton" style={{ width: '90%' }} />
              <span className="skeleton" style={{ width: '65%' }} />
            </div>
          )}
          <div className="sources">
            <span className="src"><Icon name="db" size={12} />From your grant record</span>
            {v.citations.map((c) => (
              <button key={c.id} type="button" className="src src-kb" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <Icon name="doc" size={12} />{c.title} · {c.section}
              </button>
            ))}
          </div>
          {passage && (
            <blockquote className="quote">
              <span className="quote-head">{passage.title} › {passage.section}</span>
              “{passage.text}”
              <span className="small muted" style={{ display: 'block', marginTop: 6 }}>[Sample knowledge-base text: replace with approved content]</span>
            </blockquote>
          )}
        </>
      )}
    </div>
  );
}

function KbAnswer({ m }: { m: Extract<AgentMessage, { kind: 'kb_answer' }> }) {
  return (
    <div className="mcard" style={{ gap: 10 }}>
      <p className="explain">{m.text}</p>
      {m.passages.map((p) => (
        <blockquote key={p.id} className="quote">
          <span className="quote-head">Source · {p.title} › {p.section}</span>
          “{p.text}”
        </blockquote>
      ))}
      <span className="small muted">[Sample knowledge-base text: replace with approved content]</span>
    </div>
  );
}

function Notice({ m }: { m: Extract<AgentMessage, { kind: 'notice' }> }) {
  return (
    <div className={`notice notice-${m.tone}`} role={m.tone === 'error' ? 'alert' : undefined}>
      <Icon name={m.tone === 'lock' ? 'lock' : 'alert'} size={18} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="notice-title">{m.title}</span>
        <span style={{ color: 'var(--ink-2)' }}>{m.body}</span>
      </div>
    </div>
  );
}

function HandoffCard({ m }: { m: Extract<AgentMessage, { kind: 'handoff' }> }) {
  return (
    <div className="mcard" style={{ gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
        <Icon name="checkCircle" size={18} stroke="var(--accent-text)" /> Passed to our {m.team} team
      </div>
      <dl className="kv">
        <div><dt>Case</dt><dd>{m.caseId}</dd></div>
        <div><dt>Expected reply</dt><dd>Within {m.responseHours} hours</dd></div>
        <div><dt>Reason</dt><dd>{m.reason}</dd></div>
      </dl>
      <div className="ok-box">They’ll see this conversation, so you won’t need to repeat yourself.</div>
      <button type="button" className="link-btn" onClick={() => store.set({ view: 'rep', repSelected: m.caseId })}>See what the rep sees →</button>
    </div>
  );
}
