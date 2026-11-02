import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { fmtDateTime, fmtDuration, now } from '../agent/clock';
import type { CaseRecord } from '../agent/types';
import { store, toast, useApp } from '../state/store';
import { Icon } from './Icon';
import { StatusCard } from './MessageView';

type Filter = 'open' | 'ai' | 'resolved' | 'all';

function useTick(ms: number | null) {
  const [, set] = useState(0);
  useEffect(() => {
    if (ms === null) return;
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function slaLeft(c: CaseRecord) {
  return c.createdAt.getTime() + c.slaHours * 3_600_000 - now().getTime();
}

export function RepConsole() {
  // WCAG 2.2.2: SLA countdowns update automatically, so they can be paused.
  const [live, setLive] = useState(true);
  useTick(live ? 5000 : null);
  const cases = useApp((s) => s.cases);
  const selectedId = useApp((s) => s.repSelected);
  const [filter, setFilter] = useState<Filter>('open');
  const visible = cases.filter((c) => (filter === 'open' ? c.status === 'open' : filter === 'ai' ? c.createdByAgent : filter === 'resolved' ? c.status === 'resolved' : true));
  const selected = cases.find((c) => c.id === selectedId) ?? visible[0] ?? cases[0];
  const open = cases.filter((c) => c.status === 'open').length;

  return (
    <div className="page">
      <section className="card queue" aria-label="Case queue">
        <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <h2 className="h2" style={{ fontSize: 15 }}>Cases</h2>
            <span className="small muted">{open} open · signed in as Dana Brooks (rep)</span>
          </div>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} aria-pressed={!live} onClick={() => setLive(!live)}>
            {live ? 'Pause live SLA timers' : 'Resume live SLA timers'}
          </button>
          <div className="seg" role="group" aria-label="Filter cases">
            {(['open', 'ai', 'resolved', 'all'] as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'open' ? 'Open' : f === 'ai' ? 'From AI' : f === 'resolved' ? 'Resolved' : 'All'}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 && <div className="empty">No cases match this filter.</div>}
        {visible.map((c) => {
          const left = slaLeft(c);
          const urgent = left < 3 * 3_600_000;
          return (
            <button key={c.id} type="button" className={`queue-item ${c.status === 'resolved' ? 'resolved' : ''} ${c.live ? 'fresh' : ''}`}
              aria-current={selected?.id === c.id} onClick={() => store.set({ repSelected: c.id })}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.donorName}</span>
                <span className="small muted">{c.id}</span>
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.caseType} · {c.reason}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span className={`pill ${c.createdByAgent ? 'pill-ai' : 'pill-neutral'}`} style={{ fontSize: 11 }}>{c.live ? 'AI · this session' : c.createdByAgent ? 'AI-created' : 'Rep-created'}</span>
                <span className={`pill ${c.status === 'resolved' ? 'pill-approved' : urgent ? 'pill-review' : 'pill-neutral'}`} style={{ fontSize: 11 }}>
                  {c.status === 'resolved' ? 'Resolved' : `SLA ${fmtDuration(left)}`}
                </span>
                <span className="pill pill-neutral" style={{ fontSize: 11 }}>{c.team}</span>
              </span>
            </button>
          );
        })}
      </section>
      {selected ? <CaseDetail key={selected.id} c={selected} /> : <div className="detail"><div className="card empty">No cases yet. Escalate one from the donor chat.</div></div>}
    </div>
  );
}

function CaseDetail({ c }: { c: CaseRecord }) {
  const tasks = useApp((s) => s.tasks);
  const [tab, setTab] = useState<'summary' | 'log' | 'transcript'>('summary');
  const [calling, setCalling] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState('');

  const update = (patch: Partial<CaseRecord>) => store.set((s) => ({ cases: s.cases.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));
  const resolved = c.status === 'resolved';
  const log = tasks.filter((t) => c.taskIds.includes(t.task_id)).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const left = slaLeft(c);

  const draftReply = () => {
    const first = c.donorName.split(' ')[0];
    const g = c.grantSnapshot;
    const line = g
      ? `I looked into your grant to ${g.grant.grantee_name} (${g.grant.grant_id}). It’s currently ${g.statusLabel.toLowerCase()}.`
      : 'I looked into your question.';
    return `Hi ${first}, thanks for reaching out. ${line} ${c.callback ? `I’ll call you ${c.callback.toLowerCase()} as scheduled with an update.` : 'I’ll follow up with an update shortly.'}\n\nDana Brooks, ${c.team}`;
  };

  const TABS = ['summary', 'log', 'transcript'] as const;
  // Arrow keys move between tabs (WAI-ARIA tabs pattern); Home/End jump to the ends.
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next]);
    document.getElementById(`tab-${TABS[next]}`)?.focus();
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    update({ replies: [...c.replies, reply], transcript: [...c.transcript, { who: 'Dana (rep)', text: reply }] });
    setReplyOpen(false);
    setTab('transcript');
    toast(`Reply sent to ${c.donorName}`);
  };

  return (
    <section className="detail" aria-label="Case detail">
      <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 320px' }}>
          <span className="small muted">{c.id} · {c.caseType} ({c.caseTypeId}) · {c.team} · opened {fmtDateTime(c.createdAt)}</span>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{c.donorName} · {c.accountName}</h1>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className={`pill ${c.createdByAgent ? 'pill-ai' : 'pill-neutral'}`}>{c.createdByAgent ? 'Created by AI assistant' : 'Created by rep'}</span>
            <span className={`pill ${resolved ? 'pill-approved' : left < 3 * 3_600_000 ? 'pill-review' : 'pill-neutral'}`}>{resolved ? 'Resolved' : `SLA ${c.slaHours}h · ${fmtDuration(left)} left`}</span>
            {c.callback && <span className="pill pill-approved">Callback {c.callback}</span>}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
          <button type="button" className={`btn ${calling ? 'btn-danger' : 'btn-primary'}`} disabled={resolved}
            onClick={() => { setCalling(!calling); toast(calling ? `Call logged to ${c.id}` : `Calling ${c.donorName}…`); }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="phone" size={14} />{calling ? 'End call' : 'Call donor'}</span>
          </button>
          <button type="button" className="btn" disabled={resolved} aria-expanded={replyOpen}
            onClick={() => { setReply(draftReply()); setReplyOpen(!replyOpen); }}>Reply</button>
          <button type="button" className="btn"
            onClick={() => { update({ status: resolved ? 'open' : 'resolved' }); setCalling(false); toast(resolved ? `${c.id} reopened` : `${c.id} resolved`); }}>
            {resolved ? 'Reopen' : 'Mark resolved'}
          </button>
        </div>
      </div>

      {replyOpen && (
        <form className="card card-pad" onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <label htmlFor="reply" className="h2">Reply to {c.donorName}</label>
            <span className="small muted">Drafted by the AI assistant from this case. Edit before sending.</span>
          </div>
          <textarea id="reply" className="reply" value={reply} onChange={(e) => setReply(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={!reply.trim()}>Send reply</button>
            <button type="button" className="btn btn-ghost" onClick={() => setReplyOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="tabs" role="tablist" aria-label="Case sections" onKeyDown={onTabKey}>
          {([['summary', 'Summary'], ['log', `Tool log (${log.length})`], ['transcript', `Transcript (${c.transcript.length})`]] as const).map(([k, label]) => (
            <button key={k} id={`tab-${k}`} type="button" role="tab" className="tab" aria-selected={tab === k} aria-controls={`panel-${k}`}
              tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'summary' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '2 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 className="h2">AI summary</h2>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{c.summary}</p>
                <dl className="facts">
                  <div><dt>Why it escalated</dt><dd>{c.reason}</dd></div>
                  <div><dt>Donor’s words</dt><dd>“{c.donorWords}”</dd></div>
                  <div><dt>Suggested next step</dt><dd>{c.nextStep}</dd></div>
                  <div><dt>Donor sentiment</dt><dd className="muted" style={{ fontWeight: 400 }}>[From command center]</dd></div>
                </dl>
              </div>
              <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 className="h2">What the donor saw</h2>
                {c.grantSnapshot ? <StatusCard view={c.grantSnapshot} compact /> : <p className="small muted" style={{ margin: 0 }}>No grant card was shown in this conversation.</p>}
              </div>
            </div>
          )}
          {tab === 'log' && (
            log.length ? (
              <div className="table-wrap" role="region" aria-label="Tool log" tabIndex={0}>
                <table className="data">
                  <thead><tr><th scope="col">Time</th><th scope="col">Tool</th><th scope="col">Status</th><th scope="col">Result</th><th scope="col" style={{ textAlign: 'right' }}>ms</th></tr></thead>
                  <tbody>
                    {log.map((t) => (
                      <tr key={t.task_id}>
                        <td className="mono">{t.created_at.slice(11, 19)}</td>
                        <td className="mono">{t.task_type}</td>
                        <td className={t.task_status === 'FAILED' ? 'status-fail' : 'status-ok'}>{t.task_status}</td>
                        <td>{t.result_summary || t.error_message}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{t.execution_time_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="small muted" style={{ margin: 0 }}>No tool calls on this case.</p>
          )}
          {tab === 'transcript' && (
            <ol className="transcript">
              {c.transcript.map((l, i) => (
                <li key={i} className={l.who === 'Donor' ? 'donor' : l.who.startsWith('Dana') ? 'rep' : ''}><strong>{l.who}:</strong> {l.text}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
