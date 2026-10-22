/**
 * چک کردن تاریخ‌های یک رصد.
 *
 * از یک تب اختصاصی استفاده می‌کنیم و برای هر تاریخ مستقیم به آدرس نتایج
 * می‌رویم. تب اصلی دست‌نخورده می‌ماند تا جریان رزرو و تحویل به کاربر مختل نشود.
 *
 * (چرا مستقیم API نمی‌زنیم؟ چون رجا payload را سمت کلاینت رمز می‌کند —
 * توضیح در CLAUDE.md. پس چاره‌ای جز رندر کردن صفحه نداریم.)
 *
 * پیش‌تر این کار با iframe انجام می‌شد تا چند تاریخ موازی شوند، اما در عمل
 * بوت‌شدن دوباره‌ی اپ Angular داخل iframeهای پشت‌سرهم ناپایدار بود و نزدیک
 * نیمی از تاریخ‌ها اصلاً رندر نمی‌شدند. ناوبری ساده‌ی یک تب هم سریع‌تر است
 * هم قابل‌اعتماد.
 */
import type { Page } from 'playwright';
import type { TrainOffer } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
import { parseRawCard, type RawCard } from './parseCard.js';
import { buildSearchUrl, type SearchUrlParams } from './searchUrl.js';
import { search as sel } from './selectors.js';

const log = createLogger('raja:probe');

/** سقف انتظار برای رندر شدن نتایج یک تاریخ */
const RENDER_TIMEOUT_MS = 15_000;
/** اگر صفحه رندر نشد، چند بار دیگر تلاش کنیم */
const RETRY_ON_TIMEOUT = 1;

/**
 * مکث بین چک کردن دو تاریخ.
 *
 * بدون این، رجا زیر بار درخواست‌های پشت‌سرهم «خطا در اتصال سرویس» می‌دهد و
 * عملاً همه‌ی نتایج را از دست می‌دهیم. کمی صبر، هم مؤدبانه‌تر است هم
 * در عمل نتیجه‌ی بهتری می‌دهد.
 *
 * در آزمایش، حدود ۸ تا ۱۲ بارگذاری پشت‌سرهم محدودیت را فعال می‌کرد. پس
 * رصدی با تاریخ‌های زیاد و فاصله‌ی کوتاه، خودش را خفه می‌کند — به همین
 * دلیل `runner` با دیدن خطای سرویس پله‌پله عقب می‌کشد.
 */
const POLITE_GAP_MS = 1_200;

/** گزارش یک چرخه‌ی کامل رصد */
export interface ProbeReport {
  offers: TrainOffer[];
  /** چند تاریخ با خطای سرویس روبه‌رو شد — نشانه‌ی نیاز به عقب‌نشینی */
  serviceErrors: number;
  /** چند تاریخ اصلاً رندر نشد */
  timeouts: number;
}

/**
 * خروجی یک تلاش.
 *
 * `empty` جواب قطعی است («این تاریخ قطار ندارد»)، اما `serviceError` و
 * `timeout` یعنی نمی‌دانیم و نباید نتیجه‌گیری کنیم.
 */
export type ProbeOutcome = 'ok' | 'empty' | 'serviceError' | 'timeout';

/**
 * منتظر می‌ماند تا صفحه به یکی از حالت‌های نهایی برسد.
 *
 * ⚠️ چرا locator و نه `waitForFunction` یا `evaluate` در حلقه؟
 * اپ Angular حین بوت‌شدن execution context صفحه را عوض می‌کند و هر
 * `evaluate` ای که در آن لحظه بیفتد خطا می‌دهد. locatorهای Playwright در
 * برابر این جابه‌جایی مقاوم‌اند و تنها روشی بودند که در عمل پایدار ماند.
 *
 * ⚠️ متن هم بررسی می‌شود چون کلاس `alert-danger` را بنرهای اطلاعیه‌ی بالای
 * سایت هم دارند؛ بدون بررسی متن هر صفحه‌ای «خالی» به نظر می‌رسد.
 */
async function waitForResults(page: Page): Promise<ProbeOutcome> {
  const wait = { state: 'attached' as const, timeout: RENDER_TIMEOUT_MS };

  return Promise.race<ProbeOutcome>([
    page.locator(sel.card).first().waitFor(wait).then(() => 'ok'),
    page
      .locator(sel.emptyState, { hasText: sel.emptyStateText })
      .first()
      .waitFor(wait)
      .then(() => 'empty'),
    page
      .locator(sel.emptyState, { hasText: sel.serviceErrorText })
      .first()
      .waitFor(wait)
      .then(() => 'serviceError'),
  ]).catch<ProbeOutcome>(() => 'timeout');
}

/** کارت‌های خام صفحه‌ی فعلی را بیرون می‌کشد. */
async function extractCards(page: Page): Promise<RawCard[]> {
  return (await page.evaluate(
    (selectors) =>
      Array.from(document.querySelectorAll(selectors.card)).map((card) => ({
        owner: (card.querySelector(selectors.owner)?.textContent ?? '').trim(),
        salonTitle: (card.querySelector(selectors.salonTitle)?.textContent ?? '').trim(),
        salonType: (card.querySelector(selectors.salonType)?.textContent ?? '').trim(),
        trainNumber: (card.querySelector(selectors.trainNumber)?.textContent ?? '').trim(),
        fromStation: (card.querySelector(selectors.fromStation)?.textContent ?? '').trim(),
        toStation: (card.querySelector(selectors.toStation)?.textContent ?? '').trim(),
        departTime: (card.querySelector(selectors.departTime)?.textContent ?? '').trim(),
        arriveTime: (card.querySelector(selectors.arriveTime)?.textContent ?? '').trim(),
        price: (card.querySelector(selectors.price)?.textContent ?? '').trim(),
        capacity: (card.querySelector(selectors.capacity)?.textContent ?? '').trim(),
        fullText: (card as HTMLElement).innerText ?? '',
      })),
    sel,
  )) as RawCard[];
}

/** نتیجه‌ی چک کردن یک تاریخ */
interface DateResult {
  cards: RawCard[];
  outcome: ProbeOutcome;
}

/** یک تاریخ را چک می‌کند؛ در صورت رندر نشدن یک بار دیگر تلاش می‌کند. */
async function probeDate(page: Page, url: string, date: string): Promise<DateResult> {
  let last: ProbeOutcome = 'timeout';

  for (let attempt = 0; attempt <= RETRY_ON_TIMEOUT; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS });
    } catch {
      last = 'timeout';
      continue; // ناوبری نیمه‌کاره ماند؛ دوباره تلاش کن
    }

    last = await waitForResults(page);
    if (last === 'empty') return { cards: [], outcome: last };
    if (last === 'ok') return { cards: await extractCards(page), outcome: last };

    // خطای سرویس یعنی رجا تحت فشار است؛ تلاش دوباره‌ی فوری اوضاع را بدتر می‌کند
    if (last === 'serviceError') break;

    log.debug('تاریخ رندر نشد، تلاش دوباره', { date, attempt: attempt + 1 });
  }

  return { cards: [], outcome: last };
}

/**
 * همه‌ی تاریخ‌های یک رصد را پشت‌سرهم چک می‌کند و نتایج را یکجا برمی‌گرداند.
 * ترتیبی است چون یک تب داریم — و در عمل هر تاریخ حدود یک ثانیه می‌گیرد.
 */
export async function probeDates(
  page: Page,
  base: Omit<SearchUrlParams, 'date'>,
  dates: string[],
): Promise<ProbeReport> {
  const offers: TrainOffer[] = [];
  let serviceErrors = 0;
  let timeouts = 0;

  for (const [index, date] of dates.entries()) {
    // مکث کوتاه بین تاریخ‌ها — با سایت محترمانه رفتار می‌کنیم
    if (index > 0) await page.waitForTimeout(POLITE_GAP_MS).catch(() => undefined);

    const url = buildSearchUrl({ ...base, date });
    const { cards, outcome } = await probeDate(page, url, date);

    if (outcome === 'serviceError') {
      serviceErrors += 1;
      log.warn('رجا خطای سرویس داد؛ فعلاً عقب می‌کشیم', { date });
      break; // ادامه دادن فقط فشار را بیشتر می‌کند
    }
    if (outcome === 'timeout') {
      timeouts += 1;
      log.warn('این تاریخ رندر نشد و از این چرخه کنار گذاشته شد', { date });
    }

    cards.forEach((card, i) => offers.push(parseRawCard(card, date, i)));
  }

  return { offers, serviceErrors, timeouts };
}
