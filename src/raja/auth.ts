/**
 * ورود به حساب رجا و نگه‌داشتن سشن.
 *
 * رجا پس از ورود موفق یک JWT در `localStorage.Access_Token` می‌گذارد
 * (حدود ۶۵۰ کاراکتر) و پرچم `LgUF` را پر می‌کند. همین دو تا معیار
 * تشخیص ما هستند — نه ظاهر صفحه، که ممکن است عوض شود.
 *
 * اعتبارنامه‌ها از تنظیمات محلی پنل خوانده می‌شوند و هرگز لاگ نمی‌شوند.
 */
import type { Page } from 'playwright';
import { getRuntimeSettings, hasRajaCredentials } from '../config/settings.js';
import { createLogger } from '../utils/logger.js';
import { auth as sel, RAJA_ORIGIN, routes } from './selectors.js';

const log = createLogger('raja:auth');
const SESSION_USERNAME_KEY = 'TicketHunter_RajaUsername';

/** آیا همین حالا سشن معتبری در مرورگر هست؟ */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(
      ([tokenKey, flagKey]) => {
        const token = window.localStorage.getItem(tokenKey!) ?? '';
        const flag = window.localStorage.getItem(flagKey!) ?? '';
        // توکن واقعی چند صد کاراکتر است؛ رشته‌ی کوتاه یعنی خالی یا پاک‌شده
        return token.length > 50 && flag.length > 0;
      },
      [sel.tokenKey, sel.userFlagKey] as const,
    );
  } catch {
    return false;
  }
}

/**
 * در صورت نیاز وارد حساب می‌شود. اگر از قبل وارد باشیم کاری نمی‌کند.
 * در موفقیت `true` برمی‌گرداند.
 */
export async function ensureLoggedIn(page: Page): Promise<boolean> {
  const settings = getRuntimeSettings();

  if (await isLoggedIn(page)) {
    const sessionUsername = await page.evaluate(
      (key) => window.localStorage.getItem(key!) ?? '',
      SESSION_USERNAME_KEY,
    );
    if (!settings.rajaUsername || sessionUsername === settings.rajaUsername) return true;

    // نام کاربری پنل تغییر کرده؛ سشن حساب قبلی نباید بی‌صدا استفاده شود.
    log.info('سشن متعلق به حساب دیگری بود؛ خروج و ورود دوباره');
    await page.evaluate(
      ([tokenKey, flagKey, usernameKey]) => {
        window.localStorage.removeItem(tokenKey!);
        window.localStorage.removeItem(flagKey!);
        window.localStorage.removeItem(usernameKey!);
      },
      [sel.tokenKey, sel.userFlagKey, SESSION_USERNAME_KEY] as const,
    );

    /*
     * ⚠️ بارگذاری دوباره حیاتی است. پاک کردن localStorage حالتِ درون‌حافظه‌ی
     * Angular را عوض نمی‌کند؛ صفحه همچنان «وارد شده» رندر می‌شود و کلیک روی
     * «ورود / عضویت» به‌جای فرم ورود، منوی کاربر را باز می‌کند. نتیجه‌اش
     * انتظار بی‌پایان برای `#UserName` و شکست ورود بود.
     */
    await page.goto(RAJA_ORIGIN + routes.home, { waitUntil: 'domcontentloaded' });
  }

  if (!hasRajaCredentials(settings)) {
    log.error('نام کاربری یا رمز رجا در پنل تنظیم نشده است');
    return false;
  }

  log.info('سشن رجا برقرار نیست، در حال ورود');

  // فرم ورود روی صفحه‌ی اصلی در دسترس است
  if (!page.url().startsWith(RAJA_ORIGIN + routes.search)) {
    await page.goto(RAJA_ORIGIN + routes.home, { waitUntil: 'domcontentloaded' });
  }

  try {
    if (!(await openLoginForm(page))) {
      // فرم باز نشد؛ شاید در واقع از قبل وارد بوده‌ایم
      if (await isLoggedIn(page)) {
        log.info('صفحه از قبل وارد شده بود');
        await rememberUsername(page, settings.rajaUsername);
        return true;
      }
      log.error('فرم ورود باز نشد');
      return false;
    }

    await page.fill(sel.username, settings.rajaUsername);
    await page.fill(sel.password, settings.rajaPassword);
    // فرم با Enter ثبت می‌شود؛ دکمه‌ی ورود سلکتور پایداری ندارد
    await page.press(sel.password, 'Enter');
  } catch (error) {
    log.error('پر کردن فرم ورود شکست خورد', { error: String(error) });
    return false;
  }

  // منتظر می‌مانیم تا توکن در localStorage بنشیند
  const ok = await waitForLogin(page, 20_000);
  if (ok) {
    await rememberUsername(page, settings.rajaUsername);
    log.info('ورود موفق بود');
  } else {
    log.error('ورود ناموفق — نام کاربری یا رمز را بررسی کنید');
  }
  return ok;
}

/**
 * فرم ورود را باز می‌کند.
 *
 * فرم داخل dropdown هدر جمع شده و تا باز نشود `#UserName` وجود دارد ولی
 * `hidden` است. اگر بعد از کلیک باز نشد، یک بار صفحه را تازه می‌کنیم —
 * معمولاً یعنی Angular هنوز حالت «وارد شده» را نگه داشته بود.
 */
async function openLoginForm(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const toggle = page.locator(sel.loginToggle).first();
    if (await toggle.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await toggle.click().catch(() => undefined);
    }

    const opened = await page
      .locator(sel.username)
      .first()
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return true;

    if (attempt === 0) {
      log.debug('فرم ورود باز نشد؛ صفحه تازه‌سازی می‌شود');
      await page.goto(RAJA_ORIGIN + routes.home, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1_500);
    }
  }
  return false;
}

/** نام کاربریِ سشن جاری را علامت می‌زند تا بعداً بشود تشخیص داد. */
async function rememberUsername(page: Page, username: string): Promise<void> {
  await page
    .evaluate(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [SESSION_USERNAME_KEY, username] as const,
    )
    .catch(() => undefined);
}

/** تا `timeoutMs` منتظر می‌ماند که توکن ظاهر شود. */
async function waitForLogin(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/** طول توکن — فقط برای گزارش وضعیت در داشبورد، خود توکن هرگز بیرون نمی‌رود. */
export async function tokenLength(page: Page): Promise<number> {
  try {
    return await page.evaluate(
      (key) => (window.localStorage.getItem(key!) ?? '').length,
      sel.tokenKey,
    );
  } catch {
    return 0;
  }
}
