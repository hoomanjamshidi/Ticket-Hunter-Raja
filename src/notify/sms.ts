/**
 * ارسال پیامک از طریق ملی پیامک (payamak-panel).
 *
 * دو حالت پشتیبانی می‌شود و در تنظیمات قابل انتخاب است:
 *
 *  simple  → متد SendSimpleSMS2 روی REST. متن آزاد است، پس می‌توانیم همه‌ی
 *            جزئیات (قطار، ساعت، مبلغ) را بفرستیم. اما اگر شماره‌ی گیرنده در
 *            لیست سیاه مخابرات باشد پیامک نمی‌رسد (کد ۳۵).
 *
 *  pattern → متد SendByBaseNumber روی SOAP. متن ثابت است و فقط متغیرها را
 *            می‌فرستیم، ولی به لیست سیاه مخابرات هم می‌رسد — برای اعلان
 *            «ورود به درگاه» که نباید از دست برود، گزینه‌ی مطمئن‌تری است.
 */
import { getRuntimeSettings } from '../config/settings.js';
import type { RuntimeSettings } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
import { describeResponse, isSuccess, suggestsPatternMode, type SmsMode } from './errors.js';

const log = createLogger('notify:sms');

const REST_ENDPOINT = 'https://rest.payamak-panel.com/api/SendSMS/SendSMS';
const SOAP_ENDPOINT = 'http://api.payamak-panel.com/post/Send.asmx';

/** نتیجه‌ی یک تلاش ارسال */
export interface SmsResult {
  ok: boolean;
  /** پاسخ خام سامانه — معمولاً recId یا کد خطا */
  raw: string;
  /** توضیح فارسی، آماده برای نمایش در داشبورد */
  message: string;
  /** آیا بهتر است کاربر به حالت pattern سوییچ کند؟ */
  shouldSwitchToPattern: boolean;
}

/** آنچه برای ساختن یک پیامک لازم است */
export interface SmsPayload {
  /** متن کامل — فقط در حالت simple استفاده می‌شود */
  text: string;
  /** متغیرهای الگو به ترتیب — فقط در حالت pattern استفاده می‌شود */
  args: string[];
}

/** فرار دادن کاراکترهای XML برای پاکت SOAP. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** حالت simple: خط اختصاصی، متن آزاد. */
async function sendSimple(settings: RuntimeSettings, to: string, text: string): Promise<string> {
  const body = new URLSearchParams({
    username: settings.smsUsername,
    password: settings.smsPassword,
    to,
    from: settings.smsFrom,
    text,
  });

  const response = await fetch(REST_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const raw = (await response.text()).trim();

  // پاسخ REST گاهی JSON است (`{"Value":"...","RetStatus":1}`) و گاهی رشته‌ی خام
  try {
    const parsed = JSON.parse(raw) as { Value?: string };
    if (parsed && typeof parsed.Value === 'string') return parsed.Value.trim();
  } catch {
    // رشته‌ی خام بود؛ همان را برمی‌گردانیم
  }
  return raw.replace(/^"|"$/g, '');
}

/**
 * حالت pattern: خط خدماتی اشتراکی با متن پیش‌فرض.
 *
 * پاکت SOAP دستی ساخته می‌شود تا وابستگی اضافه نیاورد و کنترل کامل روی
 * سریال‌سازی آرایه‌ی `text` داشته باشیم — که همان متغیرهای الگوست.
 */
async function sendPattern(settings: RuntimeSettings, to: string, args: string[]): Promise<string> {
  const items = args.map((arg) => `<string>${escapeXml(arg)}</string>`).join('');

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendByBaseNumber xmlns="http://tempuri.org/">
      <username>${escapeXml(settings.smsUsername)}</username>
      <password>${escapeXml(settings.smsPassword)}</password>
      <text>${items}</text>
      <to>${escapeXml(to)}</to>
      <bodyId>${escapeXml(settings.smsBodyId)}</bodyId>
    </SendByBaseNumber>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(SOAP_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://tempuri.org/SendByBaseNumber',
    },
    body: envelope,
  });

  const xml = await response.text();
  const match = xml.match(/<SendByBaseNumberResult>([\s\S]*?)<\/SendByBaseNumberResult>/);
  return (match?.[1] ?? xml).trim();
}

/**
 * پیامک را با حالت پیکربندی‌شده می‌فرستد.
 * هرگز پرتاب نمی‌کند — خطا را به `SmsResult` تبدیل می‌کند تا حلقه‌ی رصد
 * به خاطر یک پیامک ناموفق متوقف نشود.
 */
export async function sendSms(
  payload: SmsPayload,
  to?: string,
  mode?: SmsMode,
): Promise<SmsResult> {
  const settings = getRuntimeSettings();
  const recipient = to ?? settings.notifyMobile;
  const selectedMode = mode ?? settings.smsMode;

  if (!recipient) {
    return {
      ok: false,
      raw: '',
      message: 'شماره‌ی گیرنده در تنظیمات پیامک ثبت نشده است.',
      shouldSwitchToPattern: false,
    };
  }

  try {
    const raw =
      selectedMode === 'simple'
        ? await sendSimple(settings, recipient, payload.text)
        : await sendPattern(settings, recipient, payload.args);

    const ok = isSuccess(raw);
    const message = describeResponse(raw, selectedMode);
    const shouldSwitchToPattern = suggestsPatternMode(raw, selectedMode);

    if (ok) {
      log.info('پیامک ارسال شد', { to: recipient, mode: selectedMode });
    } else {
      log.warn('ارسال پیامک ناموفق بود', { to: recipient, mode: selectedMode, message });
    }

    return { ok, raw, message, shouldSwitchToPattern };
  } catch (error) {
    const message = `ارتباط با ملی پیامک برقرار نشد: ${String(error)}`;
    log.error(message, { to: recipient, mode: selectedMode });
    return { ok: false, raw: '', message, shouldSwitchToPattern: false };
  }
}
