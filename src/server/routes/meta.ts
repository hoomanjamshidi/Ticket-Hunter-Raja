/** ایستگاه‌ها، وضعیت تنظیمات، و تست پیامک */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runtimeSettingsUpdateSchema, type RuntimeSettings } from '../../config/schema.js';
import {
  getRuntimeSettings,
  hasRajaCredentials,
  hasSmsCredentials,
  updateRuntimeSettings,
} from '../../config/settings.js';
import { getStations } from '../../raja/stations.js';
import { RAJA_ORIGIN } from '../../raja/selectors.js';
import { closeBrowser, getPage, getProbePage } from '../../raja/browser.js';
import { ensureLoggedIn, tokenLength } from '../../raja/auth.js';
import { sendSms } from '../../notify/sms.js';
import { testMessage } from '../../notify/templates.js';
import { runningWatchIds } from '../../hunter/runner.js';

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  /** فهرست ایستگاه‌ها برای autocomplete */
  app.get('/api/stations', async () => getStations());

  /**
   * وضعیت پیکربندی.
   * ⚠️ هیچ اعتبارنامه‌ای برنمی‌گردد — فقط «تنظیم شده یا نه».
   */
  app.get('/api/settings', async () => publicSettings(getRuntimeSettings()));

  /** ذخیره‌ی تنظیمات پنل؛ رمزهای ذخیره‌شده هیچ‌وقت در پاسخ برنمی‌گردند. */
  app.put('/api/settings', async (request) => {
    const input = runtimeSettingsUpdateSchema.parse(request.body ?? {});
    const before = getRuntimeSettings();
    const after = updateRuntimeSettings(input);

    /*
     * پروکسی و حالت headless فقط هنگام راه‌اندازی مرورگر اعمال می‌شوند.
     * اگر عوض شده‌اند، مرورگر را می‌بندیم تا دفعه‌ی بعد با تنظیمات تازه
     * بالا بیاید — وگرنه کاربر تغییر را ذخیره می‌کند ولی اثری نمی‌بیند.
     */
    const relaunch =
      before.headless !== after.headless ||
      before.proxyServer !== after.proxyServer ||
      before.proxyUsername !== after.proxyUsername ||
      before.proxyPassword !== after.proxyPassword;

    if (relaunch) await closeBrowser();

    return { ...publicSettings(after), browserRestarted: relaunch };
  });

  /**
   * تست حساب رجا: واقعاً وارد سایت می‌شود و نتیجه را گزارش می‌دهد.
   * تنها راه مطمئن شدن از درستی نام کاربری و رمز، همین است.
   */
  app.post('/api/settings/test-raja', async () => {
    if (!hasRajaCredentials()) {
      return { ok: false, message: 'اول نام کاربری و رمز رجا را ذخیره کنید.' };
    }

    try {
      const page = await getPage();
      const ok = await ensureLoggedIn(page);
      if (!ok) {
        return {
          ok: false,
          message: 'ورود ناموفق بود. نام کاربری و رمز را بررسی کنید.',
        };
      }
      return {
        ok: true,
        message: `ورود موفق بود (توکن ${await tokenLength(page)} کاراکتری دریافت شد).`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        message: `ارتباط با رجا برقرار نشد: ${detail.slice(0, 160)}`,
      };
    }
  });

  /**
   * تست پروکسی: از داخل همان مرورگر خودکار، IP خروجی را می‌پرسد و بعد
   * بررسی می‌کند که آیا سایت رجا از این مسیر بالا می‌آید یا نه.
   *
   * فقط «وصل شد» کافی نیست — چیزی که واقعاً اهمیت دارد این است که رجا
   * باز شود، چون سایت فقط از داخل ایران در دسترس است.
   */
  app.post('/api/settings/test-proxy', async () => {
    const settings = getRuntimeSettings();
    const usingProxy = settings.proxyServer.trim().length > 0;

    try {
      const page = await getProbePage();

      // ── IP خروجی ────────────────────────────────────────────────────
      let ip = '';
      let country = '';
      // اولی‌ها کشور را هم می‌دهند؛ ipify فقط IP ولی پایدارترین است، پس آخر می‌ماند
      for (const service of [
        'https://ipapi.co/json/',
        'https://api.country.is/',
        'https://api.ipify.org?format=json',
      ]) {
        try {
          const payload = await page.evaluate(async (url) => {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(String(response.status));
            return (await response.json()) as Record<string, unknown>;
          }, service);

          ip = String(payload.ip ?? '');
          country = String(payload.country_name ?? payload.country ?? '');
          if (ip) break;
        } catch {
          // سرویس بعدی را امتحان کن
        }
      }

      /*
       * ── آیا رجا باز می‌شود؟ ────────────────────────────────────────
       * پارامتر یکتا لازم است: پروفایل مرورگر پایدار است و رجا از کش دیسک
       * سرو می‌شود. بدون آن، حتی با پروکسی خراب هم پاسخ ۲۰۰ برمی‌گشت و
       * تست به‌غلط «سالم» گزارش می‌داد.
       */
      let rajaReachable = false;
      try {
        const response = await page.goto(`${RAJA_ORIGIN}/?_=${Date.now()}`, {
          waitUntil: 'domcontentloaded',
          timeout: 25_000,
        });
        rajaReachable = Boolean(response?.ok());
      } catch {
        rajaReachable = false;
      }

      const where = usingProxy ? 'از طریق پروکسی' : 'بدون پروکسی (اتصال مستقیم)';
      const location = [ip || 'نامشخص', country].filter(Boolean).join(' — ');

      return {
        ok: rajaReachable,
        ip,
        country,
        usingProxy,
        rajaReachable,
        message: rajaReachable
          ? `اتصال سالم است ${where}. IP خروجی: ${location}`
          : `IP خروجی: ${location} ${where}، ولی سایت رجا از این مسیر باز نشد.`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        ip: '',
        country: '',
        usingProxy,
        rajaReachable: false,
        message: `تست پروکسی انجام نشد: ${detail.slice(0, 160)}`,
      };
    }
  });

  /** ارسال پیامک تست با تنظیمات فعلی */
  app.post('/api/settings/test-sms', async (request) => {
    const body = z
      .object({ to: z.string().optional(), mode: z.enum(['simple', 'pattern']).optional() })
      .parse(request.body ?? {});

    const settings = getRuntimeSettings();
    const result = await sendSms(
      testMessage(),
      body.to || settings.notifyMobile,
      body.mode ?? settings.smsMode,
    );
    return { ok: result.ok, message: result.message, shouldSwitchToPattern: result.shouldSwitchToPattern };
  });
}

/** نمای امن تنظیمات برای داشبورد؛ هیچ رمز یا API Key ای از این مرز رد نمی‌شود. */
function publicSettings(settings: RuntimeSettings) {
  return {
    raja: {
      configured: hasRajaCredentials(settings),
      username: maskValue(settings.rajaUsername),
      hasPassword: settings.rajaPassword.length > 0,
    },
    sms: {
      configured: hasSmsCredentials(settings),
      mode: settings.smsMode,
      username: maskValue(settings.smsUsername),
      hasPassword: settings.smsPassword.length > 0,
      from: settings.smsFrom,
      bodyId: settings.smsBodyId,
      hasBodyId: settings.smsBodyId.length > 0,
      notifyMobile: settings.notifyMobile,
    },
    headless: settings.headless,
    proxy: {
      server: settings.proxyServer,
      username: settings.proxyUsername,
      hasPassword: settings.proxyPassword.length > 0,
      enabled: settings.proxyServer.trim().length > 0,
    },
    runningWatchIds: runningWatchIds(),
  };
}

/** ۰۹۱۲۳۴۵۶۷۸۹ → ۰۹۱۲***۶۷۸۹ — برای نمایش بدون افشای کامل شماره */
function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '***';
  if (value.length < 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}
