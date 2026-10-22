/**
 * اعمال فیلترهای کاربر روی نتایج جستجو.
 *
 * فیلترها را خودمان اعمال می‌کنیم نه با پنل فیلتر سایت رجا — هم انعطاف
 * بیشتری می‌دهد (لیست سفید/سیاه شماره قطار و بازه‌ی ساعت رسیدن را سایت
 * ندارد) هم یک تعامل کمتر با صفحه یعنی یک نقطه‌ی شکست کمتر.
 */
import type { TrainOffer, WatchFilters } from '../config/schema.js';
import { timeToMinutes } from '../utils/persianDigits.js';

/** یکسان‌سازی «ی/ي» و «ک/ك» تا مقایسه‌ی متن فارسی قابل‌اعتماد باشد. */
function normalizeText(value: string): string {
  return value.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ');
}

/** آیا `haystack` یکی از گزینه‌ها را در خود دارد؟ لیست خالی یعنی «مهم نیست». */
function matchesAny(haystack: string, options: string[]): boolean {
  if (options.length === 0) return true;
  const target = normalizeText(haystack);
  return options.some((option) => target.includes(normalizeText(option)));
}

/**
 * آیا ساعت در بازه است؟
 *
 * بازه‌هایی که از نیمه‌شب رد می‌شوند (مثل ۲۲:۰۰ تا ۰۶:۰۰) هم پشتیبانی
 * می‌شوند — برای قطارهای شبانه که اتفاقاً رایج‌ترین‌اند.
 */
function inTimeRange(time: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const minutes = time ? timeToMinutes(time) : null;
  if (minutes === null) return false; // ساعت ناخوانا را رد می‌کنیم، نه اینکه بپذیریم

  const start = from ? timeToMinutes(from) : null;
  const end = to ? timeToMinutes(to) : null;

  if (start !== null && end !== null) {
    return start <= end
      ? minutes >= start && minutes <= end
      : minutes >= start || minutes <= end; // بازه‌ی شبانه
  }
  if (start !== null) return minutes >= start;
  if (end !== null) return minutes <= end;
  return true;
}

/** دلیل رد شدن یک نتیجه — برای نمایش در داشبورد و دیباگ. */
export type RejectReason =
  | 'notAvailable'
  | 'seats'
  | 'departTime'
  | 'arriveTime'
  | 'price'
  | 'salonType'
  | 'salonTitle'
  | 'owner'
  | 'trainNumber';

export interface FilterResult {
  matches: boolean;
  reason?: RejectReason;
}

/**
 * یک نتیجه را در برابر فیلترها می‌سنجد.
 *
 * `requiredSeats` معمولاً برابر تعداد مسافران رصد است؛ رزرو ناقص به درد
 * نمی‌خورد پس قطاری که جا کم دارد رد می‌شود.
 */
export function evaluateOffer(
  offer: TrainOffer,
  filters: WatchFilters,
  requiredSeats: number,
): FilterResult {
  // شرط اول و مهم‌ترین شرط: اصلاً قابل خرید باشد
  if (offer.status !== 'available') return { matches: false, reason: 'notAvailable' };

  const minSeats = filters.minSeats ?? requiredSeats;
  if ((offer.availableSeats ?? 0) < minSeats) return { matches: false, reason: 'seats' };

  if (!inTimeRange(offer.departTime, filters.departFrom, filters.departTo)) {
    return { matches: false, reason: 'departTime' };
  }
  if (!inTimeRange(offer.arriveTime, filters.arriveFrom, filters.arriveTo)) {
    return { matches: false, reason: 'arriveTime' };
  }

  if (offer.priceRial !== null) {
    if (filters.minPriceRial !== undefined && offer.priceRial < filters.minPriceRial) {
      return { matches: false, reason: 'price' };
    }
    if (filters.maxPriceRial !== undefined && offer.priceRial > filters.maxPriceRial) {
      return { matches: false, reason: 'price' };
    }
  }

  if (!matchesAny(offer.salonType, filters.salonTypes)) {
    return { matches: false, reason: 'salonType' };
  }
  if (!matchesAny(offer.salonTitle, filters.salonTitles)) {
    return { matches: false, reason: 'salonTitle' };
  }
  if (!matchesAny(offer.owner, filters.owners)) {
    return { matches: false, reason: 'owner' };
  }

  if (offer.trainNumber !== null) {
    if (filters.trainNumbersExclude.includes(offer.trainNumber)) {
      return { matches: false, reason: 'trainNumber' };
    }
    if (
      filters.trainNumbersInclude.length > 0 &&
      !filters.trainNumbersInclude.includes(offer.trainNumber)
    ) {
      return { matches: false, reason: 'trainNumber' };
    }
  }

  return { matches: true };
}

/** همه‌ی نتایجی که فیلترها را پاس می‌کنند. */
export function filterOffers(
  offers: TrainOffer[],
  filters: WatchFilters,
  requiredSeats: number,
): TrainOffer[] {
  return offers.filter((offer) => evaluateOffer(offer, filters, requiredSeats).matches);
}
