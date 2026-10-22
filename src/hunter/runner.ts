/**
 * حلقه‌ی اصلی یک رصد.
 *
 * چرخه: مطمئن شو وارد حسابیم → تاریخ‌ها را چک کن → فیلتر کن → اگر چیزی
 * پیدا شد رزرو کن تا درگاه → پیامک بده و بایست. اگر نه، بخواب و دوباره.
 *
 * حلقه هرگز به خاطر یک خطای گذرا نمی‌میرد؛ فقط عقب می‌کشد و ادامه می‌دهد.
 * فقط خطاهای واقعاً متوقف‌کننده (شکست ورود) رصد را می‌خوابانند.
 */
import { offers as offerRepo, passengers as passengerRepo, runs, watches } from '../db/repositories.js';
import { totalPassengers, type Passenger, type TrainOffer, type Watch } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
import { ensureLoggedIn } from '../raja/auth.js';
import { bringToFront, getPage, getProbePage } from '../raja/browser.js';
import { probeDates } from '../raja/searchProbe.js';
import { reserveToGateway } from '../raja/reserve.js';
import { waitForUserToSolve } from '../raja/captcha.js';
import { sendSms } from '../notify/sms.js';
import { captchaBlocked, gatewayReached, loginFailed, watchFailed } from '../notify/templates.js';
import { evaluateOffer } from './filters.js';
import { pickBest } from './ranking.js';
import {
  backoffDelayMs,
  hasExceededRuntime,
  isWithinActiveWindow,
  nextDelayMs,
} from './scheduler.js';
import { clearStage, setStage } from './stages.js';

const log = createLogger('hunter:runner');

/** چقدر به کاربر فرصت بدهیم کپچا را حل کند */
const CAPTCHA_WAIT_MS = 5 * 60 * 1000;

/** رصدهای در حال اجرا، برای اینکه بتوان متوقفشان کرد */
const active = new Map<number, { stop: () => void }>();

/**
 * وقتی برنامه در حال خاموش شدن است، حلقه‌ها نباید وضعیت رصد را در دیتابیس
 * به «متوقف» تغییر دهند — وگرنه اجرای بعدی فکر می‌کند کاربر خودش متوقفشان
 * کرده و ادامه‌شان نمی‌دهد.
 */
let shuttingDown = false;

/** پیش از خاموش شدن برنامه صدا زده می‌شود. */
export function beginShutdown(): void {
  shuttingDown = true;
}

/** آیا این رصد همین حالا در حال اجراست؟ */
export function isRunning(watchId: number): boolean {
  return active.has(watchId);
}

/** فهرست رصدهای در حال اجرا */
export function runningWatchIds(): number[] {
  return [...active.keys()];
}

/** توقف یک رصد. چرخه‌ی جاری تمام می‌شود و بعد متوقف می‌شود. */
export function stopWatch(watchId: number): boolean {
  const handle = active.get(watchId);
  if (!handle) return false;
  handle.stop();
  return true;
}

/** وضعیت مرحله‌ای را هنگام حذف رصد پاک می‌کند. */
export function forgetWatch(watchId: number): void {
  stopWatch(watchId);
  clearStage(watchId);
}

/**
 * رصدهایی که هنگام خاموش شدن برنامه در حال اجرا بودند را دوباره راه می‌اندازد.
 *
 * وضعیت رصدها در SQLite می‌ماند، ولی حلقه‌ی اجرا در حافظه است؛ بدون این،
 * بعد از هر ری‌استارت کاربر باید دستی همه را دوباره استارت می‌زد و ممکن بود
 * ساعت‌ها بدون اینکه بداند هیچ رصدی فعال نباشد.
 */
export function resumeWatches(): number {
  const pending = watches.list().filter((watch) => watch.status === 'running');

  for (const watch of pending) {
    log.info('ادامه‌ی رصدی که پیش از خاموش شدن فعال بود', { watchId: watch.id, name: watch.name });
    startWatch(watch.id);
  }
  return pending.length;
}

/** خوابی که با درخواست توقف می‌شکند. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** پروفایل مسافرانی که به این رصد وصل شده‌اند، به همان ترتیب. */
function resolvePassengers(watch: Watch): Passenger[] {
  return watch.passengerIds
    .map((id) => passengerRepo.get(id))
    .filter((p): p is Passenger => p !== null);
}

/**
 * یک چرخه: چک کن، فیلتر کن، و اگر تطبیقی بود برگردان.
 * نتایج در دیتابیس ثبت می‌شوند تا داشبورد نشانشان دهد.
 */
async function runCycle(
  watch: Watch,
): Promise<{ best: TrainOffer | null; serviceErrors: number; found: number }> {
  setStage(watch.id, 'startingBrowser');
  const probePage = await getProbePage();
  const runId = runs.start(watch.id);

  const searchParams = {
    fromStationCode: watch.fromStationCode,
    toStationCode: watch.toStationCode,
    adult: watch.adult,
    child: watch.child,
    infant: watch.infant,
    ticketType: watch.ticketType,
    charterCoupe: watch.charterCoupe,
    description: watch.name,
  };

  setStage(
    watch.id,
    'searching',
    watch.dates.length === 1
      ? `تاریخ ${watch.dates[0]}`
      : `${watch.dates.length} تاریخ، از ${watch.dates[0]}`,
  );
  const report = await probeDates(probePage, searchParams, watch.dates);

  setStage(watch.id, 'filtering', `${report.offers.length} قطار پیدا شد`);
  const required = totalPassengers(watch);

  const matchIndexes = new Set<number>();
  const matches: TrainOffer[] = [];
  report.offers.forEach((offer, index) => {
    if (evaluateOffer(offer, watch.filters, required).matches) {
      matchIndexes.add(index);
      matches.push(offer);
    }
  });

  offerRepo.saveMany(runId, watch.id, report.offers, matchIndexes);
  runs.finish(runId, report.offers.length, matches.length);
  watches.markRun(watch.id);

  return {
    best: pickBest(matches, watch.ranking),
    serviceErrors: report.serviceErrors,
    found: report.offers.length,
  };
}

/**
 * رصد را شروع می‌کند. بلافاصله برمی‌گردد؛ حلقه در پس‌زمینه می‌چرخد.
 * اگر همین رصد از قبل در حال اجرا باشد کاری نمی‌کند.
 */
export function startWatch(watchId: number): boolean {
  if (active.has(watchId)) return false;

  const controller = new AbortController();
  active.set(watchId, { stop: () => controller.abort() });
  watches.setStatus(watchId, 'running');

  void loop(watchId, controller.signal).finally(() => {
    active.delete(watchId);
  });

  return true;
}

/** حلقه‌ی رصد. */
async function loop(watchId: number, signal: AbortSignal): Promise<void> {
  const startedAt = new Date();
  let consecutiveErrors = 0;

  while (!signal.aborted) {
    const watch = watches.get(watchId);
    if (!watch) return;

    if (hasExceededRuntime(watch.schedule, startedAt)) {
      log.info('سقف مدت اجرای رصد تمام شد', { watchId });
      setStage(watchId, 'stopped', 'سقف مدت اجرا تمام شد');
      watches.setStatus(watchId, 'paused');
      return;
    }

    // بیرون از پنجره‌ی فعالیت فقط منتظر می‌مانیم
    if (!isWithinActiveWindow(watch.schedule)) {
      setStage(watchId, 'waiting', 'بیرون از بازه‌ی فعالیت رصد', { nextInSec: 60 });
      await sleep(60_000, signal);
      continue;
    }

    try {
      setStage(watchId, 'loggingIn');
      const page = await getPage();

      if (!(await ensureLoggedIn(page))) {
        setStage(watchId, 'failed', 'ورود به حساب رجا ناموفق بود');
        watches.setStatus(watchId, 'failed', 'ورود به حساب رجا ناموفق بود');
        await sendSms(loginFailed(watch.name));
        return;
      }

      const { best, serviceErrors, found } = await runCycle(watch);

      if (serviceErrors > 0) {
        // رجا تحت فشار است — پله‌پله عقب بکش
        consecutiveErrors += 1;
        const delay = backoffDelayMs(consecutiveErrors, watch.schedule.baseIntervalSec * 1000);
        setStage(watchId, 'backingOff', '', { nextInSec: Math.round(delay / 1000) });
        log.warn('عقب‌نشینی به خاطر خطای سرویس رجا', { watchId, delaySec: Math.round(delay / 1000) });
        await sleep(delay, signal);
        continue;
      }

      consecutiveErrors = 0;
      log.debug('چرخه تمام شد', { watchId, found, matched: best ? 1 : 0 });

      if (best) {
        const finished = await attemptReserve(watch, best);
        if (finished) return;
      }
    } catch (error) {
      consecutiveErrors += 1;
      const detail = error instanceof Error ? error.message.slice(0, 120) : String(error);
      setStage(watchId, 'backingOff', detail);
      log.error('خطای غیرمنتظره در چرخه‌ی رصد', { watchId, error: String(error) });
      await sleep(backoffDelayMs(consecutiveErrors, 10_000), signal);
      continue;
    }

    // زمان‌بندی را دوباره می‌خوانیم تا اگر کاربر وسط کار تنظیمات را عوض کرد،
    // همان چرخه‌ی بعد اعمال شود
    const current = watches.get(watchId);
    if (!current) return;
    const delay = nextDelayMs(current.schedule);
    setStage(watchId, 'waiting', '', { nextInSec: Math.round(delay / 1000) });
    await sleep(delay, signal);
  }

  if (shuttingDown) {
    // وضعیت `running` بماند تا اجرای بعدی خودش ادامه دهد
    log.info('رصد به خاطر خاموش شدن برنامه معلق شد', { watchId });
    return;
  }

  setStage(watchId, 'stopped');
  watches.setStatus(watchId, 'paused');
  log.info('رصد متوقف شد', { watchId });
}

/**
 * تلاش برای رزرو یک بلیت پیداشده.
 * `true` یعنی رصد باید تمام شود (یا موفق شدیم یا کاربر باید دخالت کند).
 */
async function attemptReserve(watch: Watch, offer: TrainOffer): Promise<boolean> {
  log.info('بلیت مطابق فیلترها پیدا شد؛ شروع رزرو', {
    watchId: watch.id,
    train: offer.trainNumber,
    date: offer.date,
  });

  setStage(watch.id, 'reserving', `قطار ${offer.trainNumber ?? '—'} — ${offer.date}`);
  const page = await getPage();
  const passengers = resolvePassengers(watch);

  if (passengers.length === 0) {
    setStage(watch.id, 'failed', 'پروفایل مسافر تعریف نشده');
    watches.setStatus(watch.id, 'failed', 'هیچ پروفایل مسافری به این رصد وصل نشده است');
    await sendSms(watchFailed(watch.name, 'پروفایل مسافر تعریف نشده'));
    return true;
  }

  const outcome = await reserveToGateway(page, {
    offer,
    searchParams: {
      fromStationCode: watch.fromStationCode,
      toStationCode: watch.toStationCode,
      adult: watch.adult,
      child: watch.child,
      infant: watch.infant,
      ticketType: watch.ticketType,
      charterCoupe: watch.charterCoupe,
      description: watch.name,
    },
    passengers,
    contactMobile: watch.contactMobile,
    // پیش از پرداخت: اگر کپچا آمد، کنترل را به کاربر بده و منتظر بمان
    onStep: (step) => {
      if (step === 'fillPassengers') setStage(watch.id, 'fillingPassengers');
      if (step === 'submitPayment') setStage(watch.id, 'submittingPayment');
    },
    beforePayment: () =>
      waitForUserToSolve(page, CAPTCHA_WAIT_MS, async () => {
        setStage(watch.id, 'awaitingCaptcha', 'در پنل «مرورگر» کپچا را وارد کنید');
        watches.setStatus(watch.id, 'awaitingUser');
        await sendSms(captchaBlocked(offer.date));
      }),
  });

  if (outcome.ok) {
    setStage(watch.id, 'atGateway', 'پرداخت را در پنل «مرورگر» تکمیل کنید');
    watches.setStatus(watch.id, 'succeeded');
    await bringToFront();
    await sendSms(gatewayReached(offer));
    log.info('کنترل به کاربر واگذار شد', { watchId: watch.id });
    return watch.schedule.stopOnSuccess;
  }

  // «بلیت پرید» طبیعی است — فقط ادامه بده
  if (outcome.step === 'selectTrain') {
    log.info('بلیت پیش از رزرو پرید؛ رصد ادامه می‌یابد', { watchId: watch.id });
    watches.setStatus(watch.id, 'running');
    return false;
  }

  setStage(watch.id, 'failed', outcome.message);
  watches.setStatus(watch.id, 'failed', outcome.message);
  await sendSms(watchFailed(watch.name, outcome.message));
  return true;
}
