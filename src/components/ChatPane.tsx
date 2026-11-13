import { useEffect, useRef, useState, type FormEvent } from 'react';
import { runTurn } from '../agent/orchestrator';
import { useApp } from '../state/store';
import { Icon } from './Icon';
import { MessageView } from './MessageView';

/** Amazon Connect chat, simplified: one conversation, suggestions, a message box. */
export function ChatPane() {
  const messages = useApp((s) => s.messages);
  const suggestions = useApp((s) => s.suggestions);
  const busy = useApp((s) => s.busy);
  const donorId = useApp((s) => s.auth.donorId);
  const limited = useApp((s) => !s.auth.donorId && (s.auth.guest || s.auth.locked));
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Suggestions disappear while the assistant works. If keyboard focus was on one, return it to the message
  // box when the turn ends (only then: on first load focus stays where the browser put it, for the skip link).
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && (document.activeElement === document.body || document.activeElement === null)) inputRef.current?.focus();
    wasBusy.current = busy;
  }, [busy]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t || busy) return;
    setDraft('');
    runTurn({ type: 'text', text: t });
  };

  return (
    <section className="card chat" aria-labelledby="chat-title">
      <div className="chat-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="avatar" aria-hidden="true">M</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 id="chat-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Grants assistant · chat</h2>
            <span className="small muted">{donorId ? `Signed in · ${donorId}` : limited ? 'Not verified · general questions only' : 'Not signed in'}</span>
          </div>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => runTurn({ type: 'text', text: 'Talk to a person' })}>Talk to a person</button>
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
        <input id="msg" ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={donorId ? 'Ask about a grant, e.g. “Why is my grant pending?”' : limited ? 'Ask a general question, or enter your donor ID' : 'Enter your donor ID, e.g. D-01'} autoComplete="off" />
        <button type="submit" className="send" aria-label="Send" disabled={busy || !draft.trim()}><Icon name="send" size={18} width={2.2} /></button>
      </form>
      <p className="disclaimer">Answers come only from your grant records and approved policy. Don’t share Social Security, bank or card numbers.</p>
    </section>
  );
}
