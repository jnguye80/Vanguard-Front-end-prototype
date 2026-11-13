import { Fragment, useEffect } from 'react';
import { demoDonors } from './data/sample';
import { ChatPane } from './components/ChatPane';
import { DonorJourney } from './components/DonorJourney';
import { FlowPanel } from './components/FlowPanel';
import { Icon } from './components/Icon';
import { RepConsole } from './components/RepConsole';
import { VoicePane } from './components/VoicePane';
import { startOver, store, useApp, type Channel } from './state/store';

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'chat', label: 'Chat' },
  { key: 'voice', label: 'Voice call' },
];

export default function App() {
  const channel = useApp((s) => s.channel);
  const busy = useApp((s) => s.busy);
  const view = useApp((s) => s.view);
  const openCases = useApp((s) => s.cases.filter((c) => c.status === 'open').length);
  const toastText = useApp((s) => s.toast);

  // WCAG 2.4.2: the document title names the current view and channel.
  useEffect(() => {
    document.title = view === 'rep' ? 'Rep console · Momentum grants assistant' : `${channel === 'chat' ? 'Chat' : 'Voice call'} · Momentum grants assistant`;
  }, [channel, view]);

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
          <span className="badge-synth">Sample data</span>
        </div>
        <nav className="nav" aria-label="Views">
          <button type="button" aria-current={view === 'assistant' ? 'page' : undefined} onClick={() => store.set({ view: 'assistant' })}>Donor assistant</button>
          <button type="button" aria-current={view === 'rep' ? 'page' : undefined} onClick={() => store.set({ view: 'rep' })}>
            Rep console{openCases ? <span className="count">{openCases}</span> : null}
          </button>
        </nav>
      </header>
      {view === 'assistant' && (
      <section className="controls" aria-label="Channel and demo sign-in">
        <div className="channel-switch" role="group" aria-label="Channel">
          {CHANNELS.map((c) => (
            <button key={c.key} type="button" aria-pressed={channel === c.key} disabled={busy}
              onClick={() => { if (channel !== c.key) startOver(c.key); }}>
              <Icon name={c.key === 'chat' ? 'chat' : 'phone'} size={15} />{c.label}
            </button>
          ))}
        </div>
        <p className="controls-note">
          <strong>Sample donors (fictional):</strong>{' '}
          {demoDonors().map(({ donor }, i) => (
            <Fragment key={donor.donor_id}>
              {i > 0 && ' · '}
              <span className="donor-hint">
                <span className="mono">{donor.donor_id}</span> {donor.account_name.split(' ')[0]}
                {donor.account_status !== 'ACTIVE' && ' (suspended)'}
                {channel === 'voice' && <>, PIN <span className="mono">{donor.voice_pin}</span></>}
              </span>
            </Fragment>
          ))}
        </p>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startOver()}>Start over</button>
      </section>
      )}
      <main id="main" tabIndex={-1}>
        {view === 'assistant' ? (
          <>
            <h1 className="sr-only">Grants assistant: {channel === 'chat' ? 'chat' : 'voice call'}</h1>
            <div className="simple">
              <DonorJourney />
              <div className="simple-channel">{channel === 'chat' ? <ChatPane /> : <VoicePane />}</div>
              <div className="simple-flow"><FlowPanel /></div>
            </div>
          </>
        ) : <RepConsole />}
      </main>
      <div className="toast-region" role="status" aria-live="polite">
        {toastText && <div className="toast"><Icon name="check" stroke="#5fb49c" width={2.4} />{toastText}</div>}
      </div>
    </>
  );
}
