/**
 * منبع واحد تنظیمات قابل ویرایش پنل.
 *
 * این توابع در هر استفاده مقدار تازه را از SQLite می‌خوانند؛ بنابراین تغییر
 * حساب رجا یا ملی پیامک بدون راه‌اندازی دوباره‌ی سرور اعمال می‌شود.
 */
import {
  runtimeSettingsSchema,
  runtimeSettingsUpdateSchema,
  type RuntimeSettings,
  type RuntimeSettingsUpdate,
} from './schema.js';
import { appSettings } from '../db/repositories.js';
import { toLatinDigits } from '../utils/persianDigits.js';

export function getRuntimeSettings(): RuntimeSettings {
  return appSettings.get() ?? runtimeSettingsSchema.parse({});
}

export function updateRuntimeSettings(input: RuntimeSettingsUpdate): RuntimeSettings {
  const patch = runtimeSettingsUpdateSchema.parse(input);
  const current = getRuntimeSettings();

  return appSettings.save({
    rajaUsername:
      patch.raja?.username === undefined
        ? current.rajaUsername
        : toLatinDigits(patch.raja.username),
    rajaPassword: patch.raja?.password ?? current.rajaPassword,
    smsMode: patch.sms?.mode ?? current.smsMode,
    smsUsername:
      patch.sms?.username === undefined
        ? current.smsUsername
        : toLatinDigits(patch.sms.username),
    smsPassword: patch.sms?.password ?? current.smsPassword,
    smsFrom:
      patch.sms?.from === undefined ? current.smsFrom : toLatinDigits(patch.sms.from),
    smsBodyId:
      patch.sms?.bodyId === undefined ? current.smsBodyId : toLatinDigits(patch.sms.bodyId),
    notifyMobile:
      patch.sms?.notifyMobile === undefined
        ? current.notifyMobile
        : toLatinDigits(patch.sms.notifyMobile),
    headless: patch.headless ?? current.headless,
    proxyServer:
      patch.proxy?.server === undefined ? current.proxyServer : patch.proxy.server.trim(),
    proxyUsername:
      patch.proxy?.username === undefined ? current.proxyUsername : patch.proxy.username.trim(),
    proxyPassword: patch.proxy?.password ?? current.proxyPassword,
  });
}

/**
 * پیکربندی پروکسی برای Playwright، یا `undefined` اگر تنظیم نشده باشد.
 *
 * Playwright آدرس بدون پروتکل را نمی‌پذیرد، پس اگر کاربر فقط `host:port`
 * نوشت خودمان `http://` جلویش می‌گذاریم.
 */
export function proxyConfig(
  settings: RuntimeSettings = getRuntimeSettings(),
): { server: string; username?: string; password?: string } | undefined {
  const raw = settings.proxyServer.trim();
  if (!raw) return undefined;

  const server = /^[a-z0-9]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  return {
    server,
    ...(settings.proxyUsername ? { username: settings.proxyUsername } : {}),
    ...(settings.proxyPassword ? { password: settings.proxyPassword } : {}),
  };
}

/** آیا نام کاربری و رمز رجا هر دو ثبت شده‌اند؟ */
export function hasRajaCredentials(settings: RuntimeSettings = getRuntimeSettings()): boolean {
  return settings.rajaUsername.length > 0 && settings.rajaPassword.length > 0;
}

/** آیا تنظیمات لازم برای حالت انتخاب‌شده‌ی پیامک کامل است؟ */
export function hasSmsCredentials(settings: RuntimeSettings = getRuntimeSettings()): boolean {
  const base = settings.smsUsername.length > 0 && settings.smsPassword.length > 0;
  if (!base) return false;
  return settings.smsMode === 'simple'
    ? settings.smsFrom.length > 0
    : settings.smsBodyId.length > 0;
}
