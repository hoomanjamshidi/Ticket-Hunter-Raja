/**
 * تشخیص کپچا و تحویل کنترل به کاربر.
 *
 * ⚠️ ما کپچا را حل نمی‌کنیم. کاری که اینجا انجام می‌شود:
 * تشخیص بده → امن متوقف شو → پنجره را جلو بیاور → پیامک بده →
 * صبر کن کاربر خودش وارد کند → به محض حل شدن، خودکار ادامه بده.
 *
 * در پیمایش کامل مسیر با حساب لاگین‌شده هیچ کپچایی ظاهر نشد، پس این یک
 * مسیر استثناست نه بخشی از جریان عادی.
 */
import type { Page } from 'playwright';
import { createLogger } from '../utils/logger.js';
import { bringToFront } from './browser.js';
import { captcha as sel } from './selectors.js';

const log = createLogger('raja:captcha');

/** هر چند وقت یک‌بار چک کنیم که کاربر کپچا را حل کرده یا نه */
const POLL_INTERVAL_MS = 2_000;

/** آیا همین حالا کپچایی روی صفحه هست؟ */
export async function isCaptchaVisible(page: Page): Promise<boolean> {
  try {
    return await page.locator(sel.imageSelectors).first().isVisible({ timeout: 1_000 });
  } catch {
    return false;
  }
}

/**
 * منتظر می‌ماند تا کاربر کپچا را حل کند.
 *
 * `true` یعنی کپچا برطرف شد و می‌توان ادامه داد؛ `false` یعنی مهلت تمام شد.
 * `onDetected` یک بار و فقط وقتی کپچا واقعاً دیده شود صدا زده می‌شود —
 * جای مناسبی برای فرستادن پیامک.
 */
export async function waitForUserToSolve(
  page: Page,
  timeoutMs: number,
  onDetected?: () => Promise<void> | void,
): Promise<boolean> {
  if (!(await isCaptchaVisible(page))) return true;

  log.warn('کپچا ظاهر شد؛ در پنل بخش «مرورگر» آن را وارد کنید');
  await bringToFront();
  await onDetected?.();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(POLL_INTERVAL_MS).catch(() => undefined);
    if (!(await isCaptchaVisible(page))) {
      log.info('کپچا حل شد؛ ادامه‌ی خودکار جریان');
      return true;
    }
  }

  log.error('مهلت انتظار برای حل کپچا تمام شد');
  return false;
}

/**
 * شنود درخواست‌های کپچا.
 *
 * رجا سرویس `GetRajaCaptcha` دارد؛ اگر صدا زده شد یعنی کپچا در راه است،
 * حتی پیش از آنکه المانش روی صفحه بنشیند.
 */
export function watchForCaptchaRequests(page: Page, onRequest: () => void): () => void {
  const handler = (request: { url(): string }): void => {
    if (request.url().includes(sel.requestPattern)) onRequest();
  };
  page.on('request', handler);
  return () => page.off('request', handler);
}
