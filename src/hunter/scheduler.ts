/**
 * تصمیم‌گیری درباره‌ی اینکه چرخه‌ی بعدی رصد کِی اجرا شود.
 *
 * نکته‌ی کلیدی: رجا خودش اعلام کرده بلیت‌های استردادی در ساعت‌های ۹، ۱۲،
 * ۱۵، ۱۷ و ۱۹ به لیست اضافه می‌شوند. حالت `smart` نزدیک این ساعت‌ها تند
 * می‌شود و بقیه‌ی روز آرام می‌گیرد — هم شانس بیشتری دارد هم به سایت
 * فشار بیهوده نمی‌آورد.
 */
import type { WatchSchedule } from '../config/schema.js';
import { timeToMinutes } from '../utils/persianDigits.js';

/** دقیقه‌ی جاری از نیمه‌شب، به وقت محلی. */
function nowMinutes(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

/** آیا همین حالا در پنجره‌ی یکی از «ساعت‌های طلایی» هستیم؟ */
export function isBurstWindow(schedule: WatchSchedule, at: Date = new Date()): boolean {
  const minutes = nowMinutes(at);
  return schedule.burstHours.some((hour) => {
    const center = hour * 60;
    return Math.abs(minutes - center) <= schedule.burstWindowMin;
  });
}

/**
 * آیا رصد باید همین حالا فعال باشد؟
 * پنجره‌ی فعالیت می‌تواند از نیمه‌شب رد شود (مثلاً ۲۲:۰۰ تا ۰۶:۰۰).
 */
export function isWithinActiveWindow(schedule: WatchSchedule, at: Date = new Date()): boolean {
  const { activeFrom, activeTo } = schedule;
  if (!activeFrom || !activeTo) return true;

  const minutes = nowMinutes(at);
  const start = timeToMinutes(activeFrom);
  const end = timeToMinutes(activeTo);
  if (start === null || end === null) return true;

  return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
}

/**
 * فاصله تا چرخه‌ی بعدی، به میلی‌ثانیه.
 *
 * به همه‌ی فاصله‌ها کمی jitter تصادفی اضافه می‌شود تا الگوی درخواست‌ها
 * ماشینی و یکنواخت نباشد.
 */
export function nextDelayMs(schedule: WatchSchedule, at: Date = new Date()): number {
  const seconds =
    schedule.mode === 'fixed'
      ? schedule.baseIntervalSec
      : isBurstWindow(schedule, at)
        ? schedule.burstIntervalSec
        : schedule.idleIntervalSec;

  return withJitter(seconds * 1000);
}

/** ±۲۰٪ نوسان تصادفی */
export function withJitter(ms: number, ratio = 0.2): number {
  const delta = ms * ratio;
  return Math.round(ms - delta + Math.random() * delta * 2);
}

/**
 * وقتی رجا خطای سرویس می‌دهد، فاصله را پله‌پله زیاد می‌کنیم.
 * سقف پنج دقیقه تا رصد برای همیشه خواب نماند.
 */
export function backoffDelayMs(consecutiveErrors: number, baseMs: number): number {
  const MAX_MS = 5 * 60 * 1000;
  const grown = baseMs * 2 ** Math.min(consecutiveErrors, 5);
  return withJitter(Math.min(grown, MAX_MS));
}

/** آیا از سقف مدت اجرا گذشته‌ایم؟ صفر یعنی بی‌نهایت. */
export function hasExceededRuntime(
  schedule: WatchSchedule,
  startedAt: Date,
  at: Date = new Date(),
): boolean {
  if (schedule.maxRuntimeMin === 0) return false;
  return at.getTime() - startedAt.getTime() > schedule.maxRuntimeMin * 60_000;
}
