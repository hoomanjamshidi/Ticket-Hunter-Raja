/** تاریخچه: تایم‌لاین چرخه‌های هر رصد. */
import { useEffect, useState } from 'react';
import { api, type RunRow, type Watch } from '../lib/api';
import { fa, timeOf } from '../lib/format';
import { Card, Empty } from '../components/ui';
import './History.css';

export function HistoryPage({ watches }: { watches: Watch[] }) {
  const [watchId, setWatchId] = useState<number | null>(watches[0]?.id ?? null);
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => {
    if (watchId === null && watches.length > 0) setWatchId(watches[0]!.id);
  }, [watches, watchId]);

  useEffect(() => {
    if (watchId === null) return;
    const load = (): void => {
      void api.runs(watchId).then(setRuns).catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [watchId]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>تاریخچه</h1>
        {watches.length > 0 && (
          <select
            className="picker"
            value={watchId ?? ''}
            onChange={(e) => setWatchId(Number(e.target.value))}
            aria-label="انتخاب رصد"
          >
            {watches.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      <Card title="چرخه‌های رصد">
        {runs.length === 0 ? (
          <Empty title="هنوز چرخه‌ای اجرا نشده" hint="پس از شروع رصد، هر بار چک کردن اینجا ثبت می‌شود." />
        ) : (
          <ol className="timeline">
            {runs.map((run) => (
              <li key={run.id} className={run.matched > 0 ? 'is-hit' : undefined}>
                <span className="timeline-dot" aria-hidden="true" />
                <div className="timeline-body">
                  <span className="tnum timeline-time">{timeOf(run.startedAt)}</span>
                  <span>
                    {fa(run.offersFound)} قطار دیده شد
                    {run.matched > 0 && (
                      <strong className="hit"> — {fa(run.matched)} مورد مطابق فیلتر</strong>
                    )}
                  </span>
                  {run.note && <span className="timeline-note">{run.note}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
