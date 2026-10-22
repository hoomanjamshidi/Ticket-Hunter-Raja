/**
 * تست دستی ورود به حساب رجا.
 *
 *   npm run dev:login
 *
 * نام کاربری و رمز از تنظیمات ذخیره‌شده در پنل خوانده می‌شوند.
 */
import { migrate } from '../src/db/index.js';
import { closeBrowser, getPage } from '../src/raja/browser.js';
import { ensureLoggedIn, tokenLength } from '../src/raja/auth.js';
import { hasRajaCredentials } from '../src/config/settings.js';

migrate();

if (!hasRajaCredentials()) {
  console.error('نام کاربری و رمز رجا را در صفحه‌ی تنظیمات پنل ثبت کنید.');
  process.exit(1);
}

const page = await getPage();
const ok = await ensureLoggedIn(page);

if (ok) {
  console.log(`ورود موفق. طول توکن: ${await tokenLength(page)} کاراکتر.`);
} else {
  console.error('ورود ناموفق بود.');
}

await closeBrowser();
process.exit(ok ? 0 : 1);
