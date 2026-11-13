import { useEffect, useRef, useState, type FormEvent } from 'react';
import { runTurn, toSpeech } from '../agent/orchestrator';
import { startCall, startOver, store, useApp } from '../state/store';
import { Icon } from './Icon';

// Amazon Connect voice, simulated in the browser. The caller "speaks" by tapping a phrase, typing what they
// would say, or (where the browser allows) using the microphone, and uses the keypad for the donor ID, PIN
// and menu choices. Replies are read aloud when the browser supports it; captions are always shown.

interface Recognizer { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }

function recognizerCtor(): (new () => Recognizer) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function VoicePane() {
  const call = useApp((s) => s.call);
  if (call === 'idle' || call === 'ended') return <CallStart ended={call === 'ended'} />;
  return <OnCall />;
}

function CallStart({ ended }: { ended: boolean }) {
  const speak = useApp((s) => s.speak);
  return (
    <section className="card voice" aria-labelledby="voice-title">
      <div className="voice-start">
        <span className="voice-icon" aria-hidden="true"><Icon name="phone" size={28} /></span>
        <h2 id="voice-title" style={{ margin: 0, fontSize: 18 }}>{ended ? 'Call ended' : 'Call the grants line'}</h2>
        <p className="small muted" style={{ margin: 0, maxWidth: '46ch', lineHeight: 1.55 }}>
          A simulated phone call to the same grants assistant. You’ll verify with your donor ID and PIN on the keypad, then
          ask your question out loud (or tap or type what you’d say).
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => startCall()}>
          <Icon name="phone" size={16} />{ended ? 'Call again' : 'Start call'}
        </button>
        <label className="switch">
          <input type="checkbox" checked={speak} onChange={(e) => store.set({ speak: e.target.checked })} />
          Read replies aloud (captions are always on)
        </label>
      </div>
    </section>
  );
}

function OnCall() {
  const call = useApp((s) => s.call);
  const messages = useApp((s) => s.messages);
  const suggestions = useApp((s) => s.suggestions);
  const busy = useApp((s) => s.busy);
  const auth = useApp((s) => s.auth);
  const speak = useApp((s) => s.speak);
  const [elapsed, setElapsed] = useState(0);
  const [buffer, setBuffer] = useState('');
  const [said, setSaid] = useState('');
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const spoken = useRef(new Set<string>());
  const recRef = useRef<Recognizer | null>(null);
  const live = call === 'active';
  const pinStage = !!auth.candidateId && !auth.donorId;

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Read new replies aloud (Web Speech API), once each.
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    for (const m of messages) {
      if (m.role !== 'agent' || spoken.current.has(m.id)) continue;
      if (m.kind === 'grant_status' && m.view.policyLoading) continue; // wait for the finished answer
      spoken.current.add(m.id);
      if (!speak || !synth) continue;
      try { synth.speak(new SpeechSynthesisUtterance(toSpeech(m))); } catch { /* speech not available */ }
    }
  }, [messages, speak]);

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); recRef.current?.stop(); } catch { /* ignore */ } }, []);

  const press = (k: string) => {
    if (!live || busy) return;
    if (auth.donorId) {
      if (/\d/.test(k)) runTurn({ type: 'keypad', digits: k });
      return;
    }
    if (k === '*') return setBuffer('');
    if (k === '#') {
      if (buffer) runTurn({ type: 'keypad', digits: `${buffer}#` });
      return setBuffer('');
    }
    setBuffer((b) => (b + k).slice(0, 6));
  };

  const sayIt = (e: FormEvent) => {
    e.preventDefault();
    const t = said.trim();
    if (!t || busy || !live) return;
    setSaid('');
    runTurn({ type: 'text', text: t });
  };

  const Ctor = recognizerCtor();
  const listen = () => {
    if (!Ctor) return;
    if (listening) { recRef.current?.stop(); return; }
    try {
      const r = new Ctor();
      r.lang = 'en-US';
      r.interimResults = false;
      r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript ?? ''; if (t) runTurn({ type: 'text', text: t }); };
      r.onerror = () => setMicNote('The microphone isn’t available here. Tap a phrase or type what you’d say.');
      r.onend = () => setListening(false);
      recRef.current = r;
      setMicNote('');
      setListening(true);
      r.start();
    } catch {
      setListening(false);
      setMicNote('The microphone isn’t available here. Tap a phrase or type what you’d say.');
    }
  };

  const hangUp = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    startOver('voice');
    store.set({ call: 'ended' });
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const status = call === 'transferring' ? 'Transferring…' : call === 'transferred' ? 'With a specialist (simulated)' : auth.donorId ? `Verified · ${auth.donorId}` : pinStage ? 'Enter PIN' : auth.locked ? 'Not verified · locked' : auth.guest ? 'Not verified · general questions only' : 'Not verified';

  return (
    <section className="card voice" aria-labelledby="voice-title">
      <div className="chat-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="avatar" aria-hidden="true"><Icon name="phone" size={14} /></span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 id="voice-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Grants line · voice call</h2>
            <span className="small muted"><span className="mono">{mmss}</span> · {status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" aria-pressed={speak} onClick={() => { store.set({ speak: !speak }); if (speak) window.speechSynthesis?.cancel(); }}>
            <span className="btn-in"><Icon name="volume" size={14} />Read aloud: {speak ? 'On' : 'Off'}</span>
          </button>
          <button type="button" className="btn btn-danger" onClick={hangUp}><span className="btn-in"><Icon name="hangup" size={14} />Hang up</span></button>
        </div>
      </div>

      {call !== 'active' && (
        <div className="transfer" role="status">
          {call === 'transferring' ? 'Transferring you to a specialist… (simulated hold)' : 'Connected to a specialist (simulated). They can see the case and what was said on this call.'}
          {call === 'transferred' && (
            <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={() => store.set({ view: 'rep' })}>See what the specialist sees →</button>
          )}
        </div>
      )}

      <div className="voice-body">
        <div className="captions-wrap">
          <h3 className="h3">Captions</h3>
          <div className="captions" ref={logRef} role="log" aria-live="polite" aria-label="Call captions" tabIndex={0}>
            {messages.map((m) => (
              <p key={m.id} className={m.role === 'user' ? 'cap-you' : 'cap-agent'}>
                <span className="cap-who">{m.role === 'user' ? 'You' : 'Assistant'}</span>
                <span>{m.role === 'user' ? m.text : m.kind === 'grant_status' && m.view.policyLoading ? '…' : toSpeech(m)}</span>
              </p>
            ))}
            {busy && <div className="cap-agent" role="status" aria-label="Assistant is working"><span className="cap-who">Assistant</span><span className="typing" style={{ padding: 0 }}><span /><span /><span /></span></div>}
          </div>
        </div>

        <div className="voice-controls">
          <div>
            <h3 className="h3">Keypad</h3>
            <p className="small muted" style={{ margin: '0 0 8px' }}>
              {auth.donorId ? 'Press a number to choose from a list, or 0 for a person.' : pinStage ? 'Enter your 4-digit PIN, then press #.' : 'Enter your 2-digit donor ID, then press #.'}
            </p>
            <output className="keypad-display" aria-live="polite" aria-label="Digits entered">
              {buffer ? (pinStage ? '•'.repeat(buffer.length) : buffer) : ' '}
            </output>
            <div className="keypad" role="group" aria-label="Phone keypad">
              {KEYS.map((k) => (
                <button key={k} type="button" disabled={!live || busy} onClick={() => press(k)} aria-label={k === '#' ? 'Pound' : k === '*' ? 'Star (clear)' : k}>{k}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 className="h3">Speak</h3>
            {Ctor && (
              <button type="button" className={`btn ${listening ? 'btn-primary' : ''}`} disabled={!live || busy} aria-pressed={listening} onClick={listen}>
                <span className="btn-in"><Icon name="mic" size={14} />{listening ? 'Listening… tap to stop' : 'Use microphone'}</span>
              </button>
            )}
            {micNote && <p className="small" role="status" style={{ margin: 0 }}>{micNote}</p>}
            {suggestions.length > 0 && (
              <div className="say-chips">
                {suggestions.map((c) => (
                  <button key={c.label} type="button" className="chip" disabled={!live || busy} onClick={() => runTurn(c.input)}>Say “{c.label}”</button>
                ))}
              </div>
            )}
            <form className="say-form" onSubmit={sayIt}>
              <label htmlFor="say" className="small muted">Or type what you’d say</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="say" value={said} onChange={(e) => setSaid(e.target.value)} disabled={!live} autoComplete="off" placeholder="e.g. Has my grant been paid?" />
                <button type="submit" className="btn" disabled={!live || busy || !said.trim()}>Say it</button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <p className="disclaimer">Simulated call: nothing is recorded or sent. Don’t say Social Security, bank or card numbers.</p>
    </section>
  );
}
