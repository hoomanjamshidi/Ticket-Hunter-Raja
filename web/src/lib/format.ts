/** کمک‌تابع‌های نمایش — ارقام فارسی، مبلغ، و برچسب وضعیت. */
import type { WatchStatus } from './api';

const PERSIAN_ZERO = 0x06f0;

/** ارقام لاتین را برای نمایش به فارسی تبدیل می‌کند. */
export function fa(value: string | number): string {
  return String(value).replace(/\d/g, (d) => String.fromCodePoint(PERSIAN_ZERO + Number(d)));
}

/** مبلغ ریالی با جداکننده‌ی هزار و ارقام فارسی. */
export function money(rial: number | null): string {
  if (rial === null) return '—';
  return fa(rial.toLocaleString('en-US'));
}

/** برچسب و رنگ هر وضعیت رصد. رنگ هرگز تنها نشانه نیست — متن هم هست. */
export const statusInfo: Record<WatchStatus, { label: string; color: string }> = {
  idle: { label: 'آماده', color: 'var(--fg-muted)' },
  running: { label: 'در حال رصد', color: 'var(--accent)' },
  paused: { label: 'متوقف', color: 'var(--fg-muted)' },
  awaitingUser: { label: 'منتظر شما', color: 'var(--warning)' },
  succeeded: { label: 'رسید به درگاه', color: 'var(--accent)' },
  failed: { label: 'خطا', color: 'var(--danger)' },
};

/** زمان ISO را به ساعت محلی خوانا تبدیل می‌کند. */
export function timeOf(iso: string | null): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '—';
  return fa(date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
}
