/**
 * ساخت آدرس صفحه‌ی نتایج جستجو.
 *
 * خوشبختانه صفحه‌ی نتایج رجا کاملاً آدرس‌پذیر است، پس لازم نیست فرم جستجو را
 * پر کنیم — مستقیم به URL می‌رویم. نمونه‌ی واقعی:
 *
 *   /search?adult=1&child=0&infant=0&movetype=1&ischarter=false
 *          &fs=37&ts=21&godate=14050628&tickettype=Family
 *          &returndate=&numberpassenger=1&mode=Train&desctravel=...
 */
import { toGoDate, type JalaliDate } from '../utils/jalali.js';
import { RAJA_ORIGIN, routes } from './selectors.js';

export interface SearchUrlParams {
  fromStationCode: number;
  toStationCode: number;
  date: JalaliDate;
  adult: number;
  child: number;
  infant: number;
  ticketType: string;
  charterCoupe: boolean;
  /** فقط برای خوانا بودن آدرس؛ روی نتیجه اثری ندارد */
  description?: string;
}

/** آدرس کامل صفحه‌ی نتایج برای یک تاریخ. */
export function buildSearchUrl(params: SearchUrlParams): string {
  const passengers = params.adult + params.child + params.infant;

  const query = new URLSearchParams({
    adult: String(params.adult),
    child: String(params.child),
    infant: String(params.infant),
    movetype: '1', // تک‌سفره
    ischarter: params.charterCoupe ? 'true' : 'false',
    fs: String(params.fromStationCode),
    ts: String(params.toStationCode),
    godate: toGoDate(params.date),
    tickettype: params.ticketType,
    returndate: '',
    numberpassenger: String(passengers),
    mode: 'Train',
    desctravel: params.description ?? 'قطار',
  });

  return `${RAJA_ORIGIN}${routes.search}?${query.toString()}`;
}

/** همان آدرس ولی نسبی — برای وقتی داخل صفحه‌ی رجا هستیم (مثلاً iframe). */
export function buildSearchPath(params: SearchUrlParams): string {
  return buildSearchUrl(params).slice(RAJA_ORIGIN.length);
}
