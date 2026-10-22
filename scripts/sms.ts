/**
 * تست دستی پیامک.
 *
 *   npm run dev:sms                    # با حالت ذخیره‌شده در پنل
 *   npm run dev:sms -- --mode pattern  # اجبار به حالت الگو
 *   npm run dev:sms -- --to 09120000000
 */
import { migrate } from '../src/db/index.js';
import { getRuntimeSettings, hasSmsCredentials } from '../src/config/settings.js';
import { sendSms } from '../src/notify/sms.js';
import { testMessage } from '../src/notify/templates.js';
import type { SmsMode } from '../src/notify/errors.js';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

migrate();
const settings = getRuntimeSettings();
const mode = arg('mode', settings.smsMode) as SmsMode;
const to = arg('to', settings.notifyMobile);

if (!hasSmsCredentials(settings)) {
  console.error(
    'تنظیمات ملی پیامک کامل نیست. نام کاربری، رمز یا API Key و ' +
      (mode === 'simple' ? 'شماره فرستنده' : 'کد الگو') +
      ' را در صفحه‌ی تنظیمات پنل ثبت کنید.',
  );
  process.exit(1);
}

console.log(`ارسال پیامک تست با حالت «${mode}» به ${to} ...`);
const result = await sendSms(testMessage(), to, mode);
console.log(result.message);
if (result.shouldSwitchToPattern) {
  console.log('پیشنهاد: حالت پیامک را در پنل روی «الگو» بگذارید.');
}
process.exit(result.ok ? 0 : 1);
