/**
 * نوار پیشرفت مرحله‌به‌مرحله‌ی یک رصد.
 *
 * پیش‌تر فقط یک برچسب کلی («در حال رصد») دیده می‌شد و وقتی چیزی پیش
 * نمی‌رفت معلوم نبود کجا گیر کرده. اینجا هر گام با وضعیتش نشان داده می‌شود.
 */
import { useEffect, useRef, useState } from 'react';
import { fa } from '../lib/format';
import type { StageState } from '../lib/api';
import './StageTracker.css';

/** گام‌های اصلی جریان، به ترتیب — باید با `src/hunter/stages.ts` بخواند */
const STEPS: { id: string; label: string }[] = [
  { id: 'loggingIn', label: 'ورود' },
  { id: 'searching', label: 'جستجو' },
  { id: 'filtering', label: 'فیلتر' },
  { id: 'reserving', label: 'رزرو' },
  { id: 'fillingPassengers', label: 'مسافران' },
  { id: 'submittingPayment', label: 'پرداخت' },
  { id: 'atGateway', label: 'درگاه' },
];

/** گام‌هایی که جزو مسیر اصلی نیستند ولی وضعیت مهمی را نشان می‌دهند */
const ASIDE: Record<string, 'wait' | 'warn' | 'error'> = {
  waiting: 'wait',
  startingBrowser: 'wait',
  backingOff: 'warn',
  awaitingCaptcha: 'warn',
  failed: 'error',
  stopped: 'wait',
  idle: 'wait',
};

export function StageTracker({ stage }: { stage: StageState | null }) {
  /*
   * دورترین گامی که در چرخه‌ی جاری به آن رسیده‌ایم.
   *
   * وقتی رصد بین دو چرخه منتظر است، گامِ جاری جزو مسیر اصلی نیست؛ بدون
   * این حافظه، نوار پیشرفت خالی می‌شد و کاربر فکر می‌کرد هیچ کاری نشده.
   */
  const reached = useRef(-1);

  /** شمارش معکوس زنده تا چرخه‌ی بعد */
  const [remaining, setRemaining] = useState<number | null>(null);

  const rawIndex = stage ? STEPS.findIndex((step) => step.id === stage.stage) : -1;
  if (rawIndex >= 0) {
    // شروع چرخه‌ی تازه، حافظه را از نو بساز
    reached.current = rawIndex === 0 ? 0 : Math.max(reached.current, rawIndex);
  }

  useEffect(() => {
    if (!stage || typeof stage.nextInSec !== 'number') {
      setRemaining(null);
      return;
    }
    setRemaining(stage.nextInSec);
    const timer = setInterval(() => {
      setRemaining((value) => (value === null || value <= 0 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [stage?.at, stage?.nextInSec]);

  if (!stage) return null;

  const aside = ASIDE[stage.stage];
  // در حالت‌های جانبی (انتظار، عقب‌نشینی) پیشرفتِ به‌دست‌آمده حفظ می‌شود
  const index = rawIndex >= 0 ? rawIndex : reached.current;

  return (
    <div className="stages">
      <ol className="stage-steps">
        {STEPS.map((step, position) => {
          // وقتی رصد در حالت انتظار است، آخرین گامِ رسیده روشن می‌ماند
          const state =
            position < index || (position === index && rawIndex === -1)
              ? 'done'
              : position === index
                ? 'active'
                : 'idle';

          return (
            <li key={step.id} className={`stage-step is-${state}`}>
              <span className="stage-bullet" aria-hidden="true" />
              <span className="stage-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      <p className={`stage-now${aside ? ` is-${aside}` : ''}`}>
        <strong>{stage.label}</strong>
        {stage.detail && <span className="stage-detail"> — {stage.detail}</span>}
        {remaining !== null && (
          <span className="stage-detail tnum"> ({fa(remaining)} ثانیه)</span>
        )}
      </p>
    </div>
  );
}
