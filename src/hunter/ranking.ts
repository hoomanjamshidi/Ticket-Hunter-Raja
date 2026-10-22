/**
 * انتخاب بهترین بلیت از میان نتایجی که فیلترها را پاس کرده‌اند.
 *
 * دو فلسفه‌ی متفاوت:
 *  - `firstFound`: سرعت مهم‌تر از انتخاب است. بلیت استردادی ظرف چند ثانیه
 *    می‌پرد، پس اولین گزینه‌ی معتبر را می‌گیریم.
 *  - `priority`:   کیفیت مهم‌تر است. همه را می‌سنجیم و بهترین را برمی‌داریم.
 */
import type { TrainOffer, WatchRanking } from '../config/schema.js';
import { timeToMinutes } from '../utils/persianDigits.js';

/** فاصله‌ی ساعت حرکت تا ساعت دلخواه، به دقیقه. */
function distanceToPreferred(offer: TrainOffer, preferred: string): number {
  const target = timeToMinutes(preferred);
  const actual = offer.departTime ? timeToMinutes(offer.departTime) : null;
  if (target === null || actual === null) return Number.POSITIVE_INFINITY;

  const direct = Math.abs(actual - target);
  // شبانه‌روز حلقه است: فاصله‌ی ۲۳:۰۰ تا ۰۱:۰۰ دو ساعت است نه بیست‌ودو ساعت
  return Math.min(direct, 24 * 60 - direct);
}

/** رتبه‌ی یک قطار در فهرست دلخواه کاربر؛ نبودن در فهرست یعنی ته صف. */
function preferenceIndex(offer: TrainOffer, order: number[]): number {
  if (offer.trainNumber === null) return Number.POSITIVE_INFINITY;
  const index = order.indexOf(offer.trainNumber);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/**
 * بهترین گزینه را برمی‌گرداند، یا `null` اگر فهرست خالی باشد.
 * ورودی باید از قبل فیلتر شده باشد.
 */
export function pickBest(matches: TrainOffer[], ranking: WatchRanking): TrainOffer | null {
  if (matches.length === 0) return null;
  if (ranking.mode === 'firstFound') return matches[0]!;

  const scored = [...matches];

  switch (ranking.by) {
    case 'cheapest':
      scored.sort(
        (a, b) =>
          (a.priceRial ?? Number.POSITIVE_INFINITY) - (b.priceRial ?? Number.POSITIVE_INFINITY),
      );
      break;

    case 'closestToTime': {
      // بدون ساعت دلخواه، این معیار بی‌معناست؛ به ارزان‌ترین برمی‌گردیم
      const preferred = ranking.preferredTime;
      if (!preferred) {
        scored.sort(
          (a, b) =>
            (a.priceRial ?? Number.POSITIVE_INFINITY) - (b.priceRial ?? Number.POSITIVE_INFINITY),
        );
        break;
      }
      scored.sort((a, b) => distanceToPreferred(a, preferred) - distanceToPreferred(b, preferred));
      break;
    }

    case 'trainOrder':
      scored.sort((a, b) => preferenceIndex(a, ranking.trainOrder) - preferenceIndex(b, ranking.trainOrder));
      break;
  }

  return scored[0]!;
}
