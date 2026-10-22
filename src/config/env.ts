/**
 * تنظیمات راه‌اندازی فرایند.
 *
 * حساب رجا و ملی پیامک از پنل در SQLite ذخیره می‌شوند. متغیرهای قدیمی فقط
 * برای انتقال یک‌باره‌ی نصب‌های قبلی خوانده می‌شوند و بعد از آن منبع اجرای
 * برنامه نیستند.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** یک پارسر ساده‌ی `.env` — برای اجتناب از یک وابستگی اضافه. */
function loadDotEnv(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // نبودن .env خطا نیست؛ ممکن است متغیرها از محیط بیایند
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(resolve(process.cwd(), '.env'));

const legacySettingsSchema = z.object({
  RAJA_USERNAME: z.string().default(''),
  RAJA_PASSWORD: z.string().default(''),
  MELIPAYAMAK_MODE: z.enum(['simple', 'pattern']).default('simple'),
  MELIPAYAMAK_USERNAME: z.string().default(''),
  MELIPAYAMAK_PASSWORD: z.string().default(''),
  MELIPAYAMAK_FROM: z.string().default(''),
  MELIPAYAMAK_BODY_ID: z.string().default(''),
  NOTIFY_MOBILE: z.string().default(''),
  HEADLESS: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4317),
});

export const env = envSchema.parse(process.env);

/**
 * فقط برای مهاجرت خودکار نسخه‌های قبلی. هیچ سرویس اجرایی نباید این مقدار را
 * مستقیم مصرف کند؛ منبع تنظیمات جاری `config/settings.ts` است.
 */
export const LEGACY_SETTINGS_SEED = legacySettingsSchema.parse(process.env);

/** مسیر پوشه‌ی داده‌ها — دیتابیس، پروفایل مرورگر و اسکرین‌شات‌ها. */
export const DATA_DIR = resolve(process.cwd(), 'data');
