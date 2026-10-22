/**
 * متن پیامک‌ها.
 *
 * هر رویداد دو شکل دارد: یک متن کامل برای حالت `simple`، و یک آرایه از
 * متغیرها برای حالت `pattern`. در حالت الگو، متن ثابت را باید در پنل ملی
 * پیامک ثبت و تأیید کرده باشید؛ تعداد و ترتیب متغیرها باید دقیقاً با
 * چیزی که اینجا می‌سازیم بخواند وگرنه سامانه خطای -5 می‌دهد.
 */
import type { TrainOffer } from '../config/schema.js';
import type { SmsPayload } from './sms.js';
import { toPersianDigits } from '../utils/persianDigits.js';

/** مبلغ ریالی با جداکننده‌ی هزار و ارقام فارسی */
function formatPrice(rial: number | null): string {
  return rial === null ? 'نامشخص' : toPersianDigits(rial.toLocaleString('en-US'));
}

/**
 * مهم‌ترین پیامک: ربات به درگاه بانک رسیده و منتظر کاربر است.
 * الگو (۴ متغیر): شماره قطار، تاریخ، ساعت حرکت، مبلغ.
 */
export function gatewayReached(offer: TrainOffer): SmsPayload {
  const train = String(offer.trainNumber ?? '—');
  const time = offer.departTime ?? '—';
  const price = formatPrice(offer.priceRial);

  return {
    text:
      `بلیت پیدا شد و وارد درگاه پرداخت شدم.\n` +
      `قطار ${train} | ${offer.fromStation} به ${offer.toStation}\n` +
      `تاریخ ${offer.date} ساعت ${time}\n` +
      `مبلغ ${price} ریال\n` +
      `برای تکمیل پرداخت، در پنل به بخش «مرورگر» بروید.`,
    args: [train, offer.date, time, price],
  };
}

/**
 * کپچا ظاهر شده و ربات نمی‌تواند ادامه دهد.
 * الگو (۱ متغیر): تاریخ سفر.
 */
export function captchaBlocked(date: string): SmsPayload {
  return {
    text:
      `برای ادامه‌ی رزرو کپچا لازم است.\n` +
      `تاریخ سفر ${date}\n` +
      `لطفاً در پنل، بخش «مرورگر»، کپچا را وارد کنید تا ادامه دهم.`,
    args: [date],
  };
}

/**
 * سشن رجا از دست رفته و ورود دوباره ممکن نشد.
 * الگو (۱ متغیر): نام رصد.
 */
export function loginFailed(watchName: string): SmsPayload {
  return {
    text: `ورود به حساب رجا ناموفق بود و رصد «${watchName}» متوقف شد. نام کاربری و رمز را بررسی کنید.`,
    args: [watchName],
  };
}

/**
 * خطای متوقف‌کننده.
 * الگو (۲ متغیر): نام رصد، خلاصه‌ی خطا.
 */
export function watchFailed(watchName: string, reason: string): SmsPayload {
  const short = reason.slice(0, 80);
  return {
    text: `رصد «${watchName}» با خطا متوقف شد: ${short}`,
    args: [watchName, short],
  };
}

/** پیامک تست تنظیمات */
export function testMessage(): SmsPayload {
  return {
    text: 'پیامک تست از Ticket Hunter. تنظیمات ملی پیامک درست کار می‌کند.',
    args: ['تست'],
  };
}
