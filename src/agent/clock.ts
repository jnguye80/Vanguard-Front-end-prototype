// The synthetic extract was loaded on 2026-09-30, so the demo clock starts that morning (9:00 AM ET)
// and then runs in real time. Every "today", ETA and SLA countdown in the app is relative to this clock.

const DEMO_START = Date.parse('2026-09-30T13:00:00Z');
const APP_START = Date.now();

export const now = () => new Date(DEMO_START + (Date.now() - APP_START));

export const DEMO_TODAY = '2026-09-30';

const ET = 'America/New_York';

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ET });
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ET,
  }) + ' ET';
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET }) + ' ET';
}

export function fmtMoney(n: number, compact = false): string {
  if (compact && n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Whole days from the demo's "today" to an ISO date (negative = in the past). */
export function daysFromToday(iso: string): number {
  const t = Date.parse(`${iso}T12:00:00Z`);
  const today = Date.parse(`${DEMO_TODAY}T12:00:00Z`);
  return Math.round((t - today) / 86_400_000);
}

export function isoStamp(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export function fmtDuration(ms: number): string {
  const neg = ms < 0;
  const m = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(m / 60);
  const out = h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
  return neg ? `overdue ${out}` : out;
}
