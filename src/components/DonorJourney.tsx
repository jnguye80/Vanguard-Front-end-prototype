import { demoDonors } from '../data/sample';
import { useApp, type AppState } from '../state/store';
import { Icon } from './Icon';

// The donor and their journey, for whichever channel is in use. One persona for the MVP: a donor asking
// about grants they requested. The donor card lights up once they're verified; the journey shows where
// they are: reach out → verify → ask → get help (an answer, a general reply, or a person).

type StepState = 'done' | 'current' | 'todo' | 'stopped' | 'skipped';
interface JStep { key: string; label: string; sub: string; state: StepState }

function journey(s: AppState): JStep[] {
  const voice = s.channel === 'voice';
  const e = s.exchange;
  const reached = voice ? s.call !== 'idle' : true;
  const verified = !!s.auth.donorId;
  // Not verified, by choice (guest) or after 3 failed tries (locked): general questions only.
  const limited = !verified && (s.auth.guest || s.auth.locked);
  const asked = !!e && e.outcome !== 'sign_in' && (verified ? e.authentication.status === 'verified' : limited && ['guest', 'locked'].includes(e.authentication.status));
  const helped = asked && !s.busy;

  let helpSub = 'Answer, general reply, or a person';
  if (helped && e) {
    helpSub = {
      answered: limited ? 'General answer from grant policy' : 'Answered from their grant records',
      generic: limited && e.authorization.status === 'blocked' ? 'Asked to verify, or offered a person' : 'General reply, with a person on offer',
      handoff: voice ? `Transferred to ${e.handoff?.team ?? 'a specialist'}` : `Case ${e.handoff?.caseId ?? ''} · reply within ${e.handoff?.responseHours ?? 24} h`,
      sign_in: '',
    }[e.outcome];
  }

  const state = (done: boolean, prevDone: boolean): StepState => (done ? 'done' : prevDone ? 'current' : 'todo');
  return [
    { key: 'reach', label: voice ? 'Calls the grants line' : 'Opens the chat', sub: voice ? 'Amazon Connect voice' : 'Amazon Connect chat', state: reached ? 'done' : 'current' },
    {
      key: 'verify', label: verified ? 'Verifies identity' : limited ? 'Not verified' : 'Verifies identity',
      sub: s.auth.locked ? 'Locked after 3 tries · general questions only' : s.auth.guest && !verified ? 'Skipped · general questions only' : voice ? 'Donor ID + PIN on the keypad' : 'Donor ID',
      state: verified ? 'done' : s.auth.locked ? 'stopped' : s.auth.guest ? 'skipped' : reached ? 'current' : 'todo',
    },
    {
      key: 'ask', label: limited ? 'Asks a general question' : 'Asks about a grant',
      sub: asked && e ? `“${e.question.length > 48 ? `${e.question.slice(0, 46)}…` : e.question}”` : limited ? 'No account details until verified' : 'Only their own grants',
      state: state(asked, verified || limited),
    },
    { key: 'help', label: e?.outcome === 'handoff' && helped ? 'Gets a person' : 'Gets help', sub: helpSub, state: state(helped, asked) },
  ];
}

const STATE_TEXT: Record<StepState, string> = { done: 'done', current: 'current step', todo: 'not yet', stopped: 'stopped', skipped: 'skipped' };

export function DonorJourney() {
  const s = useApp((x) => x);
  const donor = s.auth.donorId ? demoDonors().find((d) => d.donor.donor_id === s.auth.donorId)?.donor : undefined;
  const steps = journey(s);
  const initials = donor ? donor.primary_contact_name.split(' ').map((p) => p[0]).join('') : '?';
  const how = s.channel === 'voice' ? 'by phone (donor ID + PIN)' : 'in chat (donor ID)';

  return (
    <section className="journey-bar" aria-label="Donor and journey">
      <div className={`donor-card ${donor ? 'verified' : s.auth.guest || s.auth.locked ? 'guest' : ''}`}>
        <span className="donor-avatar" aria-hidden="true">{initials}</span>
        <div className="donor-text">
          <span className="donor-kicker">Donor</span>
          {donor ? (
            <>
              <span className="donor-name">{donor.primary_contact_name}</span>
              <span className="donor-sub">{donor.account_name} · <span className="mono">{donor.donor_id}</span></span>
              <span className="donor-badge"><Icon name="check" size={12} width={2.6} />Verified {how}</span>
            </>
          ) : (
            <>
              <span className="donor-name">{s.auth.locked ? 'Couldn’t verify' : s.auth.guest ? 'Not verified' : 'Not verified yet'}</span>
              <span className="donor-sub">
                {s.auth.locked || s.auth.guest
                  ? 'General questions only · no account details'
                  : s.channel === 'voice' ? (s.auth.candidateId ? `Donor ID ${s.auth.candidateId} entered · PIN needed` : 'Unknown caller') : 'Unknown visitor'}
              </span>
              {(s.auth.locked || s.auth.guest) && <span className="donor-badge guest-badge">{s.auth.locked ? 'Locked after 3 tries' : 'Continuing as a guest'}</span>}
            </>
          )}
        </div>
      </div>
      <ol className="journey" aria-label="Donor journey">
        {steps.map((st, i) => (
          <li key={st.key} className={`jstep ${st.state}`} aria-current={st.state === 'current' ? 'step' : undefined}>
            <span className="jdot" aria-hidden="true">{st.state === 'done' ? <Icon name="check" size={13} width={2.8} /> : st.state === 'stopped' ? '!' : st.state === 'skipped' ? '–' : i + 1}</span>
            <span className="jtext">
              <span className="jlabel">{st.label}<span className="sr-only"> ({STATE_TEXT[st.state]})</span></span>
              <span className="jsub">{st.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
