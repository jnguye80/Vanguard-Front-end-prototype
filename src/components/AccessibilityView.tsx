import axe from 'axe-core';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { fmtTime, now } from '../agent/clock';
import {
  CRITERIA, GUIDELINES, PRINCIPLES, SPEC_URL, STATUS_LABEL, criterionFromAxeTag, type Criterion, type Status,
} from '../a11y/wcag21';
import { setPrefs, usePrefs, type TextSize } from '../a11y/prefs';
import { store, type View } from '../state/store';

const VIEW_NAMES: Record<Exclude<View, 'a11y'>, string> = { donor: 'Donor chat', rep: 'Rep console', audit: 'Audit log' };
const STATUS_PILL: Record<Status, string> = { supports: 'pill-paid', partial: 'pill-review', na: 'pill-neutral', 'not-targeted': 'pill-neutral' };
const WCAG21_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface ViewResult {
  view: string;
  passes: number;
  violations: { id: string; help: string; impact: string; nodes: number; criteria: string[] }[];
}

type LevelFilter = 'aa' | 'aaa' | 'all';

export function AccessibilityView() {
  const target = CRITERIA.filter((c) => c.level !== 'AAA');
  const counts = (s: Status) => target.filter((c) => c.status === s).length;

  return (
    <div className="page" style={{ flexDirection: 'column', alignItems: 'stretch', flexWrap: 'nowrap' }}>
      <section className="card card-pad a11y-hero" aria-labelledby="a11y-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span className="eyebrow">Accessibility</span>
          <h1 id="a11y-title" className="a11y-h1">Built to WCAG 2.1 Level AA</h1>
          <p className="lede">
            Momentum’s grants assistant is designed so donors and client representatives can use it with a keyboard, a screen reader,
            zoom, or reduced motion. This page reports how the prototype meets each success criterion in{' '}
            <a href={SPEC_URL} target="_blank" rel="noreferrer">Web Content Accessibility Guidelines (WCAG) 2.1<span className="sr-only"> (opens in a new tab)</span></a>,
            and lets you check the live interface yourself.
          </p>
        </div>
        <dl className="a11y-stats" aria-label={`Level A and AA: ${target.length} criteria`}>
          <div><dt>Supports</dt><dd>{counts('supports')}</dd></div>
          <div><dt>Not applicable</dt><dd>{counts('na')}</dd></div>
          <div><dt>Partially supports</dt><dd>{counts('partial')}</dd></div>
          <div><dt>Level A + AA criteria</dt><dd>{target.length}</dd></div>
        </dl>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
        <DisplaySettings />
        <LiveCheck />
      </div>

      <CriteriaTable />

      <section className="card card-pad" aria-labelledby="limits-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 id="limits-title" className="h2">Known limitations</h2>
        <ul className="limits">
          <li>Automated checks and a code review are done. The prototype has not yet been tested with screen-reader users (NVDA, JAWS, VoiceOver) or other people with disabilities. Plan that before production.</li>
          <li>The “Under the hood” trace is a dense, developer-facing panel. It meets contrast and keyboard requirements but is not written for donors.</li>
          <li>Knowledge-base passages and the Advisor and Family member roles are placeholders until Vanguard Charitable supplies approved content and the access matrix.</li>
        </ul>
      </section>
    </div>
  );
}

function DisplaySettings() {
  const prefs = usePrefs();
  const sizes: { v: TextSize; label: string }[] = [{ v: '100', label: '100%' }, { v: '125', label: '125%' }, { v: '150', label: '150%' }];
  return (
    <section className="card card-pad" aria-labelledby="display-title" style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 id="display-title" className="h2">Display settings</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Saved in this browser and applied to every view.</p>
      </div>
      <div className="control" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span className="control-label" id="size-l">Text size</span>
        <div className="seg" role="group" aria-labelledby="size-l">
          {sizes.map((s) => (
            <button key={s.v} type="button" aria-pressed={prefs.textSize === s.v} onClick={() => setPrefs({ textSize: s.v })}>{s.label}</button>
          ))}
        </div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} />
        <span>
          <span style={{ fontWeight: 600 }}>Reduce motion</span>
          <span className="small muted" style={{ display: 'block' }}>Stops message fade-ins, loading shimmer and smooth scrolling. Your system setting is also respected.</span>
        </span>
      </label>
    </section>
  );
}

// The scan switches views, which unmounts this page, so its state lives outside React.
interface CheckState { running: string | null; results: ViewResult[] | null; checkedAt: string }
let check: CheckState = { running: null, results: null, checkedAt: '' };
const checkListeners = new Set<() => void>();
const setCheck = (patch: Partial<CheckState>) => { check = { ...check, ...patch }; checkListeners.forEach((l) => l()); };
const useCheck = () => useSyncExternalStore((l) => { checkListeners.add(l); return () => { checkListeners.delete(l); }; }, () => check);

async function runCheck() {
  if (check.running) return;
  const out: ViewResult[] = [];
  for (const v of Object.keys(VIEW_NAMES) as (keyof typeof VIEW_NAMES)[]) {
    setCheck({ running: VIEW_NAMES[v] });
    store.set({ view: v });
    await new Promise((r) => setTimeout(r, 450));
    const res = await axe.run(document, { runOnly: { type: 'tag', values: WCAG21_TAGS } });
    out.push({
      view: VIEW_NAMES[v],
      passes: res.passes.length,
      violations: res.violations.map((x) => ({
        id: x.id, help: x.help, impact: x.impact ?? 'minor', nodes: x.nodes.length,
        criteria: x.tags.map(criterionFromAxeTag).filter((t): t is string => !!t),
      })),
    });
  }
  store.set({ view: 'a11y' });
  setCheck({ running: null, results: out, checkedAt: fmtTime(now()) });
  setTimeout(() => document.getElementById('check-title')?.focus(), 200);
}

function LiveCheck() {
  const { running, results, checkedAt } = useCheck();

  const total = results?.reduce((n, r) => n + r.violations.length, 0) ?? 0;

  return (
    <section className="card card-pad" aria-labelledby="check-title" style={{ flex: '2 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <h2 id="check-title" className="h2" tabIndex={-1}>Check the live interface</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Runs axe-core 4.10 with the WCAG 2.1 A and AA rules on each view. The app switches through the views while it checks, then comes back here.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={runCheck} disabled={!!running}>{running ? 'Checking…' : results ? 'Check again' : 'Check all views'}</button>
      </div>
      <div role="status" aria-live="polite" className="small">
        {running ? `Checking ${running}…` : results ? `${total === 0 ? 'No WCAG 2.1 A or AA issues found' : `${total} issue type${total === 1 ? '' : 's'} found`} across ${results.length} views · checked ${checkedAt}` : ''}
      </div>
      {results && (
        <ul className="check-results">
          {results.map((r) => (
            <li key={r.view}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{r.view}</span>
                <span className={`pill ${r.violations.length ? 'pill-declined' : 'pill-paid'}`}>
                  {r.violations.length ? `${r.violations.length} issue${r.violations.length === 1 ? '' : 's'}` : 'No issues'}
                </span>
              </div>
              <span className="small muted">{r.passes} rules passed</span>
              {r.violations.length > 0 && (
                <ul className="violations">
                  {r.violations.map((v) => (
                    <li key={v.id}>
                      <strong>{v.help}</strong> · {v.impact} · {v.nodes} element{v.nodes === 1 ? '' : 's'}
                      {v.criteria.length > 0 && <> · {v.criteria.map((id) => <CriterionLink key={id} id={id} />)}</>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CriterionLink({ id }: { id: string }) {
  const c = CRITERIA.find((x) => x.id === id);
  if (!c) return <span>WCAG {id} </span>;
  return <a href={`${SPEC_URL}#${c.anchor}`} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>WCAG {c.id} {c.name}<span className="sr-only"> (opens in a new tab)</span></a>;
}

function CriteriaTable() {
  const [level, setLevel] = useState<LevelFilter>('aa');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => CRITERIA.filter((c) =>
    (level === 'all' || (level === 'aa' ? c.level !== 'AAA' : c.level === 'AAA'))
    && (status === 'all' || c.status === status)
    && (!q.trim() || `${c.id} ${c.name} ${c.note}`.toLowerCase().includes(q.trim().toLowerCase()))), [level, status, q]);

  return (
    <section className="card card-pad" aria-labelledby="criteria-title" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id="criteria-title" className="h2" style={{ fontSize: 16 }}>WCAG 2.1 success criteria</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>Each criterion links to its definition in the W3C Recommendation.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="control">
            <span className="control-label" id="lvl-l">Level</span>
            <div className="seg" role="group" aria-labelledby="lvl-l">
              {([['aa', 'A and AA'], ['aaa', 'AAA'], ['all', 'All']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={level === k} onClick={() => setLevel(k)}>{label}</button>
              ))}
            </div>
          </div>
          <label className="control"><span className="control-label">Status</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as 'all' | Status)}>
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="control"><span className="control-label">Search</span>
            <input className="select" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. contrast, 2.4.7" />
          </label>
        </div>
      </div>
      <p role="status" className="small muted" style={{ margin: 0 }}>{rows.length} criteria shown</p>
      {PRINCIPLES.map((p) => {
        const list = rows.filter((c) => c.id.startsWith(`${p.n}.`));
        if (!list.length) return null;
        return <PrincipleTable key={p.n} n={p.n} name={p.name} list={list} />;
      })}
      {rows.length === 0 && <p className="empty">No criteria match these filters.</p>}
    </section>
  );
}

function PrincipleTable({ n, name, list }: { n: string; name: string; list: Criterion[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <h3 className="principle">{n}. {name}</h3>
      <div className="table-wrap" role="region" aria-label={`Principle ${n}: ${name}`} tabIndex={0}>
        <table className="data crit">
          <thead>
            <tr><th scope="col">Success criterion</th><th scope="col">Level</th><th scope="col">Status</th><th scope="col">How this prototype meets it</th></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <th scope="row" style={{ fontWeight: 400 }}>
                  <a href={`${SPEC_URL}#${c.anchor}`} target="_blank" rel="noreferrer">
                    <span className="mono">{c.id}</span> {c.name}<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <span className="small muted" style={{ display: 'block' }}>{GUIDELINES[c.id.split('.').slice(0, 2).join('.')]}</span>
                </th>
                <td><span className="pill pill-neutral">{c.level}</span></td>
                <td><span className={`pill ${STATUS_PILL[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                <td style={{ minWidth: 260 }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

