/**
 * نوار وضعیت چسبان بالای صفحه.
 *
 * هدفش این است که مهم‌ترین سؤال‌ها همیشه یک نگاه فاصله داشته باشند:
 * وارد حساب رجا هستیم؟ چند رصد فعال است؟ پیامک تنظیم شده؟
 */
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { Settings, Watch } from '../lib/api';
import { fa, statusInfo } from '../lib/format';
import { StatusDot } from './ui';
import './StatusBar.css';

export function StatusBar({
  settings,
  watches,
  connected,
  onRefresh,
}: {
  settings: Settings | null;
  watches: Watch[];
  connected: boolean;
  onRefresh: () => void;
}) {
  const running = watches.filter((w) => w.running);
  const needsUser = watches.filter((w) => w.status === 'awaitingUser');
  const succeeded = watches.filter((w) => w.status === 'succeeded');

  return (
    <header className="statusbar">
      {/* رویدادهای بحرانی اول می‌آیند و پررنگ‌اند */}
      {succeeded.length > 0 && (
        <span className="pill pill-success">
          وارد درگاه بانک شدیم — پرداخت را در مرورگر تکمیل کنید
        </span>
      )}
      {needsUser.length > 0 && (
        <span className="pill pill-warning">
          {fa(needsUser.length)} رصد منتظر شماست (کپچا)
        </span>
      )}

      <StatusDot
        color={settings?.raja.configured ? 'var(--accent)' : 'var(--danger)'}
        label={settings?.raja.configured ? 'حساب رجا تنظیم شده' : 'حساب رجا تنظیم نشده'}
      />

      <StatusDot
        color={settings?.sms.configured ? 'var(--accent)' : 'var(--warning)'}
        label={settings?.sms.configured ? 'پیامک آماده' : 'پیامک تنظیم نشده'}
      />

      <StatusDot
        color={running.length > 0 ? 'var(--accent)' : 'var(--fg-muted)'}
        label={running.length > 0 ? `${fa(running.length)} رصد فعال` : 'رصدی فعال نیست'}
      />

      <div className="statusbar-end">
        <span className="status" title={connected ? 'متصل به سرور' : 'اتصال قطع است'}>
          {connected ? (
            <Wifi size={14} aria-hidden="true" />
          ) : (
            <WifiOff size={14} color="var(--danger)" aria-hidden="true" />
          )}
          <span className="sr-only">{connected ? 'متصل' : 'قطع'}</span>
        </span>

        <button className="icon-btn" onClick={onRefresh} aria-label="تازه‌سازی">
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/** خلاصه‌ی وضعیت یک رصد — در کارت‌ها استفاده می‌شود */
export function WatchStatusBadge({ watch }: { watch: Watch }) {
  const info = statusInfo[watch.status];
  return <StatusDot color={info.color} label={info.label} />;
}
