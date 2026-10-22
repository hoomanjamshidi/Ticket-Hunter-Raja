/**
 * تبدیل کارت‌های صفحه‌ی نتایج به داده‌ی تایپ‌دار.
 *
 * استخراج متن خام داخل مرورگر انجام می‌شود (چون به DOM نیاز دارد) و
 * نرمال‌سازی اینجا در Node — جایی که ابزار ارقام فارسی را داریم.
 */
import { extractNumber, extractTime, toLatinDigits } from '../utils/persianDigits.js';
import type { OfferStatus, TrainOffer } from '../config/schema.js';
import { statusText } from './selectors.js';

/** متن خام یک کارت، همان‌طور که از DOM بیرون آمده */
export interface RawCard {
  owner: string;
  salonTitle: string;
  salonType: string;
  trainNumber: string;
  fromStation: string;
  toStation: string;
  departTime: string;
  arriveTime: string;
  price: string;
  capacity: string;
  /** کل متن کارت — برای تشخیص وضعیت */
  fullText: string;
}

/**
 * وضعیت کارت را از روی متنش تشخیص می‌دهد.
 * ترتیب بررسی مهم است: «تمام شد» و «حرکت کرده» را پیش از بقیه چک می‌کنیم.
 */
function detectStatus(fullText: string): OfferStatus {
  if (fullText.includes(statusText.departed)) return 'departed';
  if (fullText.includes(statusText.soldOut)) return 'soldOut';
  if (fullText.includes(statusText.selected)) return 'selected';
  if (fullText.includes(statusText.available)) return 'available';
  return 'unknown';
}

/**
 * برچسب سالن را از پیشوندش پاک می‌کند.
 * «سالن: 4 ستاره طلائيه» → «4 ستاره طلائيه»
 */
function stripLabel(value: string): string {
  const colon = value.indexOf(':');
  return (colon === -1 ? value : value.slice(colon + 1)).trim();
}

/** یک کارت خام را به `TrainOffer` تبدیل می‌کند. */
export function parseRawCard(raw: RawCard, date: string, cardIndex: number): TrainOffer {
  return {
    owner: raw.owner.trim(),
    salonTitle: stripLabel(raw.salonTitle),
    salonType: stripLabel(raw.salonType),
    trainNumber: extractNumber(raw.trainNumber),
    fromStation: raw.fromStation.trim(),
    toStation: raw.toStation.trim(),
    departTime: extractTime(raw.departTime),
    arriveTime: extractTime(raw.arriveTime),
    priceRial: extractNumber(raw.price),
    availableSeats: parseCapacity(raw.capacity),
    status: detectStatus(toLatinDigits(raw.fullText)),
    cardIndex,
    date,
  };
}

/**
 * تعداد صندلی خالی را از متن ظرفیت درمی‌آورد.
 * رجا دو شکل دارد: «۲۰+ بلیت» (یعنی بیش از ۲۰) و «فقط ۲ بلیت».
 * در هر دو حالت همان عدد را برمی‌گردانیم؛ برای «حداقل صندلی» کافی است.
 */
export function parseCapacity(capacity: string): number | null {
  return extractNumber(capacity);
}
