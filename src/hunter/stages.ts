/**
 * وضعیت مرحله‌به‌مرحله‌ی هر رصد.
 *
 * پیش‌تر تنها بازخوردِ کاربر یک برچسب کلی («در حال رصد») بود و وقتی چیزی
 * پیش نمی‌رفت هیچ معلوم نبود کجا گیر کرده. اینجا هر گام با نام و زمان ثبت
 * و بلافاصله روی WebSocket پخش می‌شود.
 */
import { createLogger } from '../utils/logger.js';

const log = createLogger('hunter:stage');

/** گام‌های جریان رصد، به ترتیب وقوع */
export type StageId =
  | 'idle'
  | 'startingBrowser'
  | 'loggingIn'
  | 'searching'
  | 'filtering'
  | 'waiting'
  | 'reserving'
  | 'fillingPassengers'
  | 'submittingPayment'
  | 'atGateway'
  | 'awaitingCaptcha'
  | 'backingOff'
  | 'stopped'
  | 'failed';

/** برچسب فارسی هر گام — همان چیزی که در داشبورد دیده می‌شود */
export const STAGE_LABEL: Record<StageId, string> = {
  idle: 'آماده',
  startingBrowser: 'راه‌اندازی مرورگر',
  loggingIn: 'ورود به حساب رجا',
  searching: 'جستجوی تاریخ‌ها',
  filtering: 'بررسی نتایج با فیلترها',
  waiting: 'در انتظار چرخه‌ی بعد',
  reserving: 'انتخاب قطار و رزرو',
  fillingPassengers: 'پر کردن مشخصات مسافران',
  submittingPayment: 'ارسال به درگاه پرداخت',
  atGateway: 'رسیدیم به درگاه بانک',
  awaitingCaptcha: 'منتظر حل کپچا توسط شما',
  backingOff: 'رجا فشار آورد؛ کمی صبر می‌کنیم',
  stopped: 'متوقف',
  failed: 'خطا',
};

/** ترتیب گام‌ها برای نمایش نوار پیشرفت */
export const STAGE_ORDER: StageId[] = [
  'loggingIn',
  'searching',
  'filtering',
  'reserving',
  'fillingPassengers',
  'submittingPayment',
  'atGateway',
];

export interface StageState {
  watchId: number;
  stage: StageId;
  label: string;
  /** توضیح کوتاه، مثلاً تاریخی که همین حالا چک می‌شود */
  detail: string;
  at: string;
  /** ثانیه تا چرخه‌ی بعد، فقط در حالت انتظار */
  nextInSec?: number;
}

const states = new Map<number, StageState>();

type StageListener = (state: StageState) => void;
const listeners = new Set<StageListener>();

/** برای پخش روی WebSocket */
export function subscribeStages(listener: StageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** وضعیت فعلی همه‌ی رصدهای فعال */
export function allStages(): StageState[] {
  return [...states.values()];
}

/** وضعیت یک رصد */
export function stageOf(watchId: number): StageState | null {
  return states.get(watchId) ?? null;
}

/** گام تازه را ثبت و پخش می‌کند. */
export function setStage(
  watchId: number,
  stage: StageId,
  detail = '',
  extra: { nextInSec?: number } = {},
): void {
  const state: StageState = {
    watchId,
    stage,
    label: STAGE_LABEL[stage],
    detail,
    at: new Date().toISOString(),
    ...extra,
  };
  states.set(watchId, state);

  log.debug(state.label, { watchId, detail });
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // شنونده‌ی خراب نباید جریان رصد را متوقف کند
    }
  }
}

/** پاک کردن وضعیت وقتی رصد حذف می‌شود. */
export function clearStage(watchId: number): void {
  states.delete(watchId);
}
