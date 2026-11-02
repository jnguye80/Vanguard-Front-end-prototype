import { demoDonors } from './data/load';
import type { Role, Scenario } from './agent/types';
import { useEffect } from 'react';
import { AccessibilityView } from './components/AccessibilityView';
import { AuditLog } from './components/AuditLog';
import { DonorView } from './components/DonorView';
import { Icon } from './components/Icon';
import { RepConsole } from './components/RepConsole';
import { newConversation, store, useApp, type View } from './state/store';

const SCENARIOS: { key: Scenario; label: string; note: string }[] = [
  { key: 'normal', label: 'Normal', note: '' },
  { key: 'stale', label: 'Gold stale', note: 'Gold layer is 6.2 h old (target < 4 h): the agent falls through to live Gemini DB.' },
  { key: 'athena_down', label: 'Athena down', note: 'Athena times out: the agent falls back to Gemini DB / Grant System API.' },
  { key: 'all_down', label: 'All sources down', note: 'Every grant source fails: the agent refuses to guess and hands off to a person.' },
];

const ROLES: { key: Role; label: string }[] = [
  { key: 'holder', label: 'Account holder' },
  { key: 'advisor', label: 'Advisor' },
  { key: 'family', label: 'Family member' },
];

export default function App() {
  const view = useApp((s) => s.view);
  const openCases = useApp((s) => s.cases.filter((c) => c.status === 'open').length);
  const newTasks = useApp((s) => s.tasks.filter((t) => t.isNew).length);
  const toast = useApp((s) => s.toast);

  const nav: { key: View; label: string; count?: number }[] = [
    { key: 'donor', label: 'Donor chat' },
    { key: 'rep', label: 'Rep console', count: openCases },
    { key: 'audit', label: 'Audit log', count: newTasks || undefined },
    { key: 'a11y', label: 'Accessibility' },
  ];

  // WCAG 2.4.2: the document title names the current view.
  useEffect(() => {
    const name = nav.find((n) => n.key === view)?.label ?? 'Donor chat';
    document.title = `${name} · Momentum`;
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to main content</a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="logo" size={18} width={2.2} /></span>
          <div>
            <div className="brand-name">Momentum</div>
            <div className="brand-sub">Grants assistant prototype · ASU AI CIC</div>
          </div>
          <span className="badge-synth">Synthetic data</span>
        </div>
        <nav className="nav" aria-label="Views">
          {nav.map((n) => (
            <button key={n.key} type="button" aria-current={view === n.key ? 'page' : undefined} onClick={() => store.set({ view: n.key })}>
              {n.label}{n.count ? <span className="count">{n.count}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      {view === 'donor' && <DonorControls />}
      <main id="main" tabIndex={-1}>
        {view === 'donor' && <DonorView />}
        {view === 'rep' && <RepConsole />}
        {view === 'audit' && <AuditLog />}
        {view === 'a11y' && <AccessibilityView />}
      </main>
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast"><Icon name="check" stroke="#5fb49c" width={2.4} />{toast}</div>}
      </div>
    </>
  );
}

function DonorControls() {
  const donorId = useApp((s) => s.donorId);
  const role = useApp((s) => s.role);
  const scenario = useApp((s) => s.scenario);
  const showTrace = useApp((s) => s.showTrace);
  const busy = useApp((s) => s.busy);
  const note = SCENARIOS.find((x) => x.key === scenario)?.note;
  return (
    <section className="controls" aria-label="Demo controls">
      <p id="controls-note" className="controls-note">Changing the donor or role starts a new chat.</p>
      <label className="control">
        <span className="control-label">Donor</span>
        <select className="select" value={donorId} disabled={busy} aria-describedby="controls-note" onChange={(e) => newConversation({ donorId: e.target.value })}>
          {demoDonors().map(({ donor, grantCount }) => (
            <option key={donor.donor_id} value={donor.donor_id}>
              {donor.account_name} · {grantCount} grant{grantCount > 1 ? 's' : ''}{donor.account_status !== 'ACTIVE' ? ` · ${donor.account_status}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="control">
        <span className="control-label" id="role-l">Viewing as</span>
        <div className="seg" role="group" aria-labelledby="role-l" aria-describedby="controls-note">
          {ROLES.map((r) => (
            <button key={r.key} type="button" disabled={busy} aria-pressed={role === r.key} onClick={() => newConversation({ role: r.key })}>{r.label}</button>
          ))}
        </div>
      </div>
      <div className="control">
        <span className="control-label" id="scn-l">Data scenario</span>
        <div className="seg" role="group" aria-labelledby="scn-l">
          {SCENARIOS.map((x) => (
            <button key={x.key} type="button" disabled={busy} aria-pressed={scenario === x.key} onClick={() => store.set({ scenario: x.key })}>{x.label}</button>
          ))}
        </div>
      </div>
      <div className="control" style={{ marginLeft: 'auto' }}>
        <button type="button" className="btn" aria-pressed={showTrace} onClick={() => store.set({ showTrace: !showTrace })}>Under the hood: {showTrace ? 'On' : 'Off'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => newConversation()}>New chat</button>
      </div>
      {note && <span className="scenario-note" role="status">{note}</span>}
    </section>
  );
}
