/**
 * صفحه‌ی رصدها: فهرست رصدها و کشوی ساخت/ویرایش.
 */
import { useState } from 'react';
import { Play, Plus, Square, Trash2, Pencil } from 'lucide-react';
import { api, type StageState, type Watch } from '../lib/api';
import { fa, statusInfo, timeOf } from '../lib/format';
import { Button, Card, Empty, StatusDot } from '../components/ui';
import { WatchForm } from '../components/WatchForm';
import { StageTracker } from '../components/StageTracker';
import './Watches.css';

export function WatchesPage({
  watches,
  stages,
  onChange,
}: {
  watches: Watch[];
  /** وضعیت زنده‌ی مراحل، کلیدش شناسه‌ی رصد است */
  stages: Record<number, StageState>;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Watch | 'new' | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** عملیات شروع/توقف/حذف را با مدیریت خطا اجرا می‌کند. */
  async function run(id: number, action: () => Promise<unknown>): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await action();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(watch: Watch): Promise<void> {
    if (!confirm(`رصد «${watch.name}» حذف شود؟`)) return;
    await run(watch.id, () => api.deleteWatch(watch.id));
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>رصدها</h1>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" />
          رصد جدید
        </Button>
      </div>

      {error && <p className="page-error" role="alert">{error}</p>}

      {watches.length === 0 ? (
        <Card>
          <Empty
            title="هنوز رصدی نساخته‌اید"
            hint="یک رصد بسازید تا ربات مسیر و تاریخ موردنظرتان را مدام چک کند."
          />
        </Card>
      ) : (
        <div className="watch-grid">
          {watches.map((watch) => (
            <Card key={watch.id}>
              <div className="watch-head">
                <div>
                  <h2 className="watch-name">{watch.name}</h2>
                  <StatusDot color={statusInfo[watch.status].color} label={statusInfo[watch.status].label} />
                </div>
                <div className="watch-actions">
                  {watch.running ? (
                    <Button onClick={() => void run(watch.id, () => api.stopWatch(watch.id))} disabled={busyId === watch.id}>
                      <Square size={15} aria-hidden="true" />
                      توقف
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => void run(watch.id, () => api.startWatch(watch.id))} disabled={busyId === watch.id}>
                      <Play size={15} aria-hidden="true" />
                      شروع
                    </Button>
                  )}
                  <Button onClick={() => setEditing(watch)} title="ویرایش">
                    <Pencil size={15} aria-hidden="true" />
                  </Button>
                  <Button variant="danger" onClick={() => void remove(watch)} title="حذف">
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <dl className="watch-meta">
                <div>
                  <dt>تاریخ‌ها</dt>
                  <dd className="tnum">
                    {watch.dates.length === 1
                      ? fa(watch.dates[0]!)
                      : `${fa(watch.dates[0]!)} تا ${fa(watch.dates[watch.dates.length - 1]!)} (${fa(watch.dates.length)} روز)`}
                  </dd>
                </div>
                <div>
                  <dt>مسافران</dt>
                  <dd className="tnum">{fa(watch.adult + watch.child + watch.infant)} نفر</dd>
                </div>
                <div>
                  <dt>چرخه‌ها</dt>
                  <dd className="tnum">{fa(watch.runCount)}</dd>
                </div>
                <div>
                  <dt>آخرین چک</dt>
                  <dd className="tnum">{timeOf(watch.lastRunAt)}</dd>
                </div>
              </dl>

              {/* وضعیت زنده مقدم بر مقدار ذخیره‌شده است */}
              <StageTracker stage={stages[watch.id] ?? watch.stage} />

              {watch.lastError && (
                <p className="watch-error" role="alert">
                  {watch.lastError}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <WatchForm
          watch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}
