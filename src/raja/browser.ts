/**
 * مدیریت مرورگر خودکار.
 *
 * مرورگر همیشه **headless** اجرا می‌شود تا هیچ پنجره‌ای روی سیستم کاربر باز
 * نشود؛ تصویرش به‌جای آن به داشبورد استریم می‌شود (`screencast.ts`) و کاربر
 * همان‌جا داخل خود اپ می‌بیند و کنترل می‌کند.
 *
 * پروفایل اختصاصی در `data/browser-profile` است و هیچ ربطی به مرورگر شخصی
 * کاربر ندارد.
 */
import { existsSync, mkdirSync, readlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { DATA_DIR } from '../config/env.js';
import { getRuntimeSettings, proxyConfig } from '../config/settings.js';
import { createLogger } from '../utils/logger.js';
import { RAJA_ORIGIN } from './selectors.js';

const log = createLogger('raja:browser');

const PROFILE_DIR = join(DATA_DIR, 'browser-profile');
export const SCREENSHOT_DIR = join(DATA_DIR, 'screenshots');

/** اندازه‌ی تصویری که به داشبورد استریم می‌شود */
export const VIEWPORT = { width: 1280, height: 800 } as const;

let context: BrowserContext | null = null;
let page: Page | null = null;
let probePage: Page | null = null;

/** شنونده‌هایی که می‌خواهند بدانند مرورگر عوض شده (برای شروع دوباره‌ی استریم) */
type PageListener = (page: Page | null) => void;
const pageListeners = new Set<PageListener>();

export function onPageChanged(listener: PageListener): () => void {
  pageListeners.add(listener);
  return () => pageListeners.delete(listener);
}

function announce(next: Page | null): void {
  for (const listener of pageListeners) {
    try {
      listener(next);
    } catch {
      // یک شنونده‌ی خراب نباید راه‌اندازی مرورگر را خراب کند
    }
  }
}

/**
 * قفل‌های جامانده‌ی پروفایل کروم را پاک می‌کند.
 *
 * اگر برنامه ناگهانی بسته شود، کروم فایل‌های `Singleton*` را جا می‌گذارد.
 * دفعه‌ی بعد کروم می‌گوید «Opening in existing browser session»، کنترل را به
 * نشست قدیمی می‌دهد و بلافاصله بیرون می‌آید — نتیجه‌اش این بود که مرورگر
 * باز می‌شد ولی هیچ اتفاقی نمی‌افتاد. این تابع دقیقاً همان حالت را می‌بندد.
 */
function clearStaleProfileLock(): void {
  const lock = join(PROFILE_DIR, 'SingletonLock');
  if (!existsSync(lock)) return;

  // مقدار لینک به شکل `hostname-pid` است
  let holder: number | null = null;
  try {
    const target = readlinkSync(lock);
    const pid = Number(target.slice(target.lastIndexOf('-') + 1));
    holder = Number.isFinite(pid) ? pid : null;
  } catch {
    holder = null;
  }

  if (holder !== null) {
    try {
      // سیگنال ۰ فقط وجود پروسه را می‌سنجد و کاری نمی‌کند
      process.kill(holder, 0);
      log.warn('یک مرورگر جامانده هنوز پروفایل را در اختیار دارد؛ بسته می‌شود', { pid: holder });
      try {
        process.kill(holder, 'SIGKILL');
      } catch {
        // شاید مال کاربر دیگری باشد؛ در بدترین حالت راه‌اندازی خطا می‌دهد
      }
    } catch {
      // پروسه‌ای وجود ندارد؛ فقط فایل قفل جا مانده
    }
  }

  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    rmSync(join(PROFILE_DIR, name), { force: true });
  }
  log.info('قفل‌های جامانده‌ی پروفایل مرورگر پاک شدند');
}

/**
 * مرورگر را (در صورت نیاز) بالا می‌آورد و تب اصلی را برمی‌گرداند.
 * فراخوانی چندباره امن است؛ همان نمونه‌ی موجود را می‌دهد.
 */
export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;

  mkdirSync(PROFILE_DIR, { recursive: true });
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  clearStaleProfileLock();

  const proxy = proxyConfig(getRuntimeSettings());
  log.info('در حال باز کردن مرورگر خودکار', {
    // فقط آدرس لاگ می‌شود، نه نام کاربری و رمز پروکسی
    proxy: proxy?.server ?? 'بدون پروکسی',
  });

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    // همیشه headless: پنجره‌ای روی سیستم کاربر باز نمی‌شود
    headless: true,
    viewport: VIEWPORT,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    // فارسی را در هدر زبان بگذاریم تا سایت همان نسخه‌ای را بدهد که انتظار داریم
    extraHTTPHeaders: { 'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8' },
    ...(proxy ? { proxy } : {}),
  });

  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30_000);

  // اگر کاربر یا سایت تب را بست، وضعیت داخلی را تمیز کن
  page.once('close', () => {
    page = null;
    announce(null);
  });

  if (!page.url().startsWith(RAJA_ORIGIN)) {
    await page.goto(RAJA_ORIGIN, { waitUntil: 'domcontentloaded' });
  }

  announce(page);
  return page;
}

/** تب اصلی، فقط اگر همین حالا باز باشد. */
export function currentPage(): Page | null {
  return page && !page.isClosed() ? page : null;
}

/**
 * تب دومی که فقط برای چک کردن تاریخ‌ها استفاده می‌شود.
 *
 * جدا نگه داشتنش یعنی حلقه‌ی رصد هرگز تب اصلی را جابه‌جا نمی‌کند؛ تب اصلی
 * همانی است که کاربر در داشبورد می‌بیند و در لحظه‌ی پرداخت تحویل می‌گیرد.
 */
export async function getProbePage(): Promise<Page> {
  if (probePage && !probePage.isClosed()) return probePage;
  const ctx = (await getPage()).context();
  probePage = await ctx.newPage();
  probePage.setDefaultTimeout(20_000);
  return probePage;
}

/**
 * پیش‌تر پنجره‌ی سیستمی را جلو می‌آورد. حالا که مرورگر داخل خود اپ دیده
 * می‌شود، کاری برای انجام دادن نیست و فقط برای سازگاری نگه داشته شده.
 */
export async function bringToFront(): Promise<void> {
  // مرورگر داخل داشبورد است؛ چیزی برای جلو آوردن وجود ندارد
}

/** اسکرین‌شات برای دیباگ گام‌های رزرو. مسیر فایل را برمی‌گرداند. */
export async function snapshot(name: string): Promise<string | null> {
  const target = currentPage();
  if (!target) return null;

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = join(SCREENSHOT_DIR, `${Date.now()}-${name}.png`);
  try {
    await target.screenshot({ path: file });
    return file;
  } catch (error) {
    log.warn('گرفتن اسکرین‌شات ناموفق بود', { name, error: String(error) });
    return null;
  }
}

/** بستن مرورگر — هنگام خاموش شدن سرور یا تغییر تنظیمات راه‌اندازی. */
export async function closeBrowser(): Promise<void> {
  announce(null);
  await context?.close().catch(() => undefined);
  context = null;
  page = null;
  probePage = null;
}
