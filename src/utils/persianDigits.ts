/**
 * ابزار کار با ارقام فارسی و عربی.
 *
 * سایت رجا اعداد را با ارقام فارسی («۱۲:۰۵»، «۱۱,۷۰۰,۰۰۰») نمایش می‌دهد و
 * کاربر هم ممکن است در فرم‌ها فارسی تایپ کند. هر عددی که از بیرون می‌آید
 * پیش از تبدیل به `number` باید از اینجا رد شود.
 */

const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_ZERO = 0x0660; // ٠

/** ارقام فارسی و عربی را به ارقام لاتین تبدیل می‌کند. بقیه‌ی متن دست‌نخورده می‌ماند. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      out += String(code - PERSIAN_ZERO);
    } else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) {
      out += String(code - ARABIC_ZERO);
    } else {
      out += char;
    }
  }
  return out;
}

/** ارقام لاتین را به فارسی تبدیل می‌کند — فقط برای نمایش. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) =>
    String.fromCodePoint(PERSIAN_ZERO + Number(d)),
  );
}

/**
 * اولین عدد صحیح موجود در متن را بیرون می‌کشد و جداکننده‌های هزار را دور می‌ریزد.
 * مثال: «۱۱,۷۰۰,۰۰۰ ريال» → 11700000 و «شماره قطار: ۵۳۳» → 533
 * اگر عددی پیدا نشود `null` برمی‌گرداند تا فراخوان تصمیم بگیرد.
 */
export function extractNumber(input: string | null | undefined): number | null {
  if (!input) return null;
  const latin = toLatinDigits(input).replace(/[,٬\s]/g, '');
  const match = latin.match(/-?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * ساعت را به شکل `HH:MM` بیرون می‌کشد.
 * مثال: «ساعت ۱۲:۰۵» → «12:05»
 */
export function extractTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const match = toLatinDigits(input).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = match[1]!.padStart(2, '0');
  return `${hour}:${match[2]}`;
}

/** `HH:MM` را به دقیقه از نیمه‌شب تبدیل می‌کند تا مقایسه‌ی بازه‌ها ساده شود. */
export function timeToMinutes(time: string): number | null {
  const normalized = extractTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}
