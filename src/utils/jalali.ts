/**
 * کار با تاریخ شمسی.
 *
 * رجا تاریخ را در پارامتر `godate` به شکل `YYYYMMDD` شمسی می‌خواهد
 * (مثلاً ۱۴۰۵/۰۶/۲۸ → `14050628`). در کل پروژه، تاریخ‌ها به صورت رشته‌ی
 * شمسی `YYYY/MM/DD` جابه‌جا می‌شوند و تبدیل فقط همین‌جا انجام می‌شود.
 */
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import { toLatinDigits } from './persianDigits.js';

dayjs.extend(jalaliday);

/** تاریخ شمسی به شکل `YYYY/MM/DD` — واحد پول رایج تاریخ در این پروژه. */
export type JalaliDate = string;

const JALALI_PATTERN = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

/** ورودی کاربر را به شکل استاندارد `YYYY/MM/DD` درمی‌آورد. */
export function normalizeJalali(input: string): JalaliDate {
  const match = toLatinDigits(input.trim()).replace(/-/g, '/').match(JALALI_PATTERN);
  if (!match) {
    throw new Error(`تاریخ شمسی نامعتبر است: ${input}`);
  }
  const [, year, month, day] = match as unknown as [string, string, string, string];
  return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
}

/** `1405/06/28` → `14050628` — همان چیزی که پارامتر `godate` می‌خواهد. */
export function toGoDate(date: JalaliDate): string {
  return normalizeJalali(date).replace(/\//g, '');
}

/** `14050628` → `1405/06/28` */
export function fromGoDate(goDate: string): JalaliDate {
  const digits = toLatinDigits(goDate).trim();
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`godate نامعتبر است: ${goDate}`);
  }
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
}

/** تاریخ شمسی امروز. */
export function todayJalali(): JalaliDate {
  return dayjs().calendar('jalali').format('YYYY/MM/DD');
}

/** `count` روز به تاریخ شمسی اضافه می‌کند (منفی هم می‌پذیرد). */
export function addDays(date: JalaliDate, count: number): JalaliDate {
  const [year, month, day] = normalizeJalali(date).split('/').map(Number) as [
    number,
    number,
    number,
  ];
  return dayjs()
    .calendar('jalali')
    .year(year)
    .month(month - 1)
    .date(day)
    .add(count, 'day')
    .format('YYYY/MM/DD');
}

/**
 * بازه‌ی تاریخ‌ها را باز می‌کند: از `from` تا `to` (هر دو شامل).
 * برای watchهایی که چند روز را همزمان رصد می‌کنند.
 */
export function expandDateRange(from: JalaliDate, to: JalaliDate): JalaliDate[] {
  const start = normalizeJalali(from);
  const end = normalizeJalali(to);
  const dates: JalaliDate[] = [start];

  // سقف امن تا اگر کاربر بازه‌ی وارونه داد، حلقه بی‌نهایت نشود.
  const MAX_DAYS = 120;
  let current = start;
  for (let i = 0; i < MAX_DAYS && current !== end; i += 1) {
    current = addDays(current, 1);
    dates.push(current);
  }
  return dates;
}

/** روز هفته به فارسی — فقط برای نمایش در داشبورد. */
export function weekdayName(date: JalaliDate): string {
  const [year, month, day] = normalizeJalali(date).split('/').map(Number) as [
    number,
    number,
    number,
  ];
  const names = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const index = dayjs()
    .calendar('jalali')
    .year(year)
    .month(month - 1)
    .date(day)
    .day();
  return names[index] ?? '';
}
