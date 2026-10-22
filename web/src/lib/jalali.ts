/**
 * تقویم شمسی برای سمت مرورگر.
 *
 * الگوریتم تبدیل بر پایه‌ی حساب سال کبیسه‌ی خورشیدی است و بدون هیچ
 * وابستگی خارجی کار می‌کند — داشبورد فقط برای انتخاب تاریخ به آن نیاز دارد
 * و آوردن یک کتابخانه‌ی کامل تقویم برای همین ارزشش را نداشت.
 */

export interface JalaliParts {
  year: number;
  month: number; // ۱ تا ۱۲
  day: number;
}

export const MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** شنبه تا جمعه — ترتیب هفته در تقویم ایرانی */
export const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/**
 * تبدیل شمسی ↔ «عدد روز ژولیَن» (JDN).
 *
 * پیاده‌سازی استاندارد بورکوفسکی با چرخه‌ی ۲۸۲۰ ساله؛ همان الگوریتمی که
 * کتابخانه‌های شناخته‌شده‌ی تقویم جلالی استفاده می‌کنند. دست‌نویس کردن
 * قاعده‌ی کبیسه به‌جای این، جای خطای یک‌روزه باز می‌کند.
 */
function jalaliToJdn(year: number, month: number, day: number): number {
  const base = year - (year >= 0 ? 474 : 473);
  const cycleYear = 474 + (base % 2820);

  return (
    day +
    (month <= 7 ? (month - 1) * 31 : (month - 1) * 30 + 6) +
    Math.floor((cycleYear * 682 - 110) / 2816) +
    (cycleYear - 1) * 365 +
    Math.floor(base / 2820) * 1_029_983 +
    1_948_320
  );
}

function jdnToJalali(jdn: number): JalaliParts {
  const depoch = jdn - jalaliToJdn(475, 1, 1);
  const cycle = Math.floor(depoch / 1_029_983);
  const cyear = depoch % 1_029_983;

  let yearInCycle: number;
  if (cyear === 1_029_982) {
    yearInCycle = 2820;
  } else {
    const aux1 = Math.floor(cyear / 366);
    const aux2 = cyear % 366;
    yearInCycle = Math.floor((2134 * aux1 + 2816 * aux2 + 2815) / 1_028_522) + aux1 + 1;
  }

  let year = yearInCycle + 2820 * cycle + 474;
  if (year <= 0) year -= 1;

  const dayOfYear = jdn - jalaliToJdn(year, 1, 1) + 1;
  const month = dayOfYear <= 186 ? Math.ceil(dayOfYear / 31) : Math.ceil((dayOfYear - 6) / 30);
  const day = jdn - jalaliToJdn(year, month, 1) + 1;
  return { year, month, day };
}

/** ۲۴۴۰۵۸۸ = عدد روز ژولیَن برای ۱ ژانویه ۱۹۷۰ */
const UNIX_EPOCH_JDN = 2_440_588;

/** شمسی → تاریخ میلادی (نیمه‌شب UTC) */
export function jalaliToDate(parts: JalaliParts): Date {
  return new Date((jalaliToJdn(parts.year, parts.month, parts.day) - UNIX_EPOCH_JDN) * 86_400_000);
}

/** تاریخ میلادی → شمسی */
export function dateToJalali(date: Date): JalaliParts {
  return jdnToJalali(Math.floor(date.getTime() / 86_400_000) + UNIX_EPOCH_JDN);
}

/** تعداد روزهای یک ماه شمسی */
export function daysInMonth(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isLeapYear(year) ? 30 : 29;
}

/**
 * سال کبیسه‌ی شمسی.
 *
 * به جای بازنویسی قاعده‌ی ۳۳ ساله، فاصله‌ی اول فروردین دو سال پیاپی را
 * می‌شماریم — همان الگوریتم تبدیل بالا مبنا قرار می‌گیرد و امکان ناسازگاری
 * بین دو محاسبه از بین می‌رود.
 */
export function isLeapYear(year: number): boolean {
  return jalaliToJdn(year + 1, 1, 1) - jalaliToJdn(year, 1, 1) === 366;
}

/**
 * شماره‌ی روز هفته با شنبه = ۰.
 * `getUTCDay()` یکشنبه را صفر می‌گیرد، پس یک واحد جابه‌جا می‌کنیم. حتماً باید
 * UTC باشد؛ با وقت محلی، اختلاف ساعت تهران تاریخ را یک روز جابه‌جا می‌کند.
 */
export function weekdayIndex(parts: JalaliParts): number {
  return (jalaliToDate(parts).getUTCDay() + 1) % 7;
}

/** امروز به شمسی */
export function todayJalali(): JalaliParts {
  return dateToJalali(new Date());
}

/** `{1405, 6, 28}` → `"1405/06/28"` */
export function formatJalali(parts: JalaliParts): string {
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}/${mm}/${dd}`;
}

/** `"۱۴۰۵/۰۶/۲۸"` یا `"1405/6/28"` → اجزا، یا `null` اگر نامعتبر باشد */
export function parseJalali(value: string): JalaliParts | null {
  const latin = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const match = latin.trim().replace(/-/g, '/').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** مقایسه‌ی دو تاریخ شمسی: منفی، صفر یا مثبت */
export function compareJalali(a: JalaliParts, b: JalaliParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** `count` روز جلو یا عقب */
export function addDays(parts: JalaliParts, count: number): JalaliParts {
  return dateToJalali(new Date(jalaliToDate(parts).getTime() + count * 86_400_000));
}

/** فاصله‌ی دو تاریخ به روز */
export function diffDays(from: JalaliParts, to: JalaliParts): number {
  return Math.round((jalaliToDate(to).getTime() - jalaliToDate(from).getTime()) / 86_400_000);
}
