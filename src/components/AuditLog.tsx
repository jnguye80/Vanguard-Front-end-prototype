import { useMemo, useState } from 'react';
import { useApp } from '../state/store';

const TYPES = ['all', 'get_donor_profile', 'get_grant_status', 'check_due_diligence', 'search_knowledge_base', 'create_service_request', 'schedule_follow_up'];

export function AuditLog() {
  const tasks = useApp((s) => s.tasks);
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [onlyNew, setOnlyNew] = useState(false);
  const rows = useMemo(() => tasks.filter((t) =>
    (type === 'all' || t.task_type === type)
    && (status === 'all' || t.task_status === status)
    && (!onlyNew || t.isNew)), [tasks, type, status, onlyNew]);
  const newCount = tasks.filter((t) => t.isNew).length;
  const failed = rows.filter((t) => t.task_status === 'FAILED').length;
  const avg = rows.length ? Math.round(rows.reduce((n, t) => n + t.execution_time_ms, 0) / rows.length) : 0;

  return (
    <div className="page" style={{ flexDirection: 'column', alignItems: 'stretch', flexWrap: 'nowrap' }}>
      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Audit log · gold.sf_tasks</h1>
            <p className="small muted" style={{ margin: '4px 0 0' }}>Every agent action, append-only. {tasks.length - newCount} rows from the synthetic extract, {newCount} written by this session.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <label className="control"><span className="control-label">Tool</span>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t === 'all' ? 'All tools' : t}</option>)}
              </select>
            </label>
            <label className="control"><span className="control-label">Status</span>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {['all', 'COMPLETED', 'FAILED', 'PENDING'].map((t) => <option key={t} value={t}>{t === 'all' ? 'All' : t}</option>)}
              </select>
            </label>
            <label className="control" style={{ gap: 6 }}>
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
              <span style={{ fontSize: 13 }}>This session only</span>
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Stat label="Rows shown" value={String(rows.length)} />
          <Stat label="Failed" value={String(failed)} />
          <Stat label="Avg execution" value={`${avg} ms`} />
        </div>
        <div className="table-wrap" role="region" aria-label="Audit log rows" tabIndex={0} style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">task_id</th><th scope="col">created_at</th><th scope="col">task_type</th><th scope="col">status</th>
                <th scope="col">grant_id</th><th scope="col">donor_id</th><th scope="col">agent_name</th><th scope="col">result / error</th><th scope="col" style={{ textAlign: 'right' }}>ms</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.task_id} className={t.isNew ? 'new' : ''}>
                  <td className="mono">{t.task_id}</td>
                  <td className="mono">{t.created_at}</td>
                  <td className="mono">{t.task_type}</td>
                  <td className={t.task_status === 'FAILED' ? 'status-fail' : 'status-ok'}>{t.task_status}</td>
                  <td className="mono">{t.grant_id || '—'}</td>
                  <td className="mono">{t.donor_id || '—'}</td>
                  <td className="mono">{t.agent_name}</td>
                  <td style={{ minWidth: 240 }}>{t.error_message ? <span className="status-fail">{t.error_message}</span> : t.result_summary}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{t.execution_time_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>result_summary is PII-masked in production. The extract’s summaries are placeholder text.</p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
