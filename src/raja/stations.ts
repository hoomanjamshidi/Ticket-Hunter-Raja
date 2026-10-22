/**
 * فهرست ایستگاه‌ها.
 *
 * رجا یک فایل ثابت `assets/File/station.json` دارد با ۱۳۶ ایستگاه.
 * یک‌بار می‌گیریم، روی دیسک کش می‌کنیم و برای autocomplete داشبورد و
 * تبدیل نام ↔ کد استفاده می‌کنیم.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { RAJA_ORIGIN, routes } from './selectors.js';

const log = createLogger('raja:stations');
const CACHE_FILE = join(DATA_DIR, 'stations.json');

export interface Station {
  Code: number;
  Name: string;
  EnglishName: string;
}

let cache: Station[] | null = null;

/**
 * ایستگاه‌ها را برمی‌گرداند. ترتیب تلاش:
 * حافظه → فایل کش → دانلود از رجا.
 */
export async function getStations(): Promise<Station[]> {
  if (cache) return cache;

  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Station[];
    if (cache.length > 0) return cache;
  } catch {
    // کش نداریم، از سایت می‌گیریم
  }

  const response = await fetch(RAJA_ORIGIN + routes.stationsJson);
  if (!response.ok) {
    throw new Error(`دریافت فهرست ایستگاه‌ها شکست خورد (${response.status})`);
  }
  const list = (await response.json()) as Station[];
  cache = list.map((s) => ({ Code: s.Code, Name: s.Name, EnglishName: s.EnglishName }));
  writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
  log.info('فهرست ایستگاه‌ها دریافت شد', { count: cache.length });
  return cache;
}

/**
 * جستجوی نام ایستگاه. رجا بعضی نام‌ها را با «ی» و «ک» عربی می‌نویسد
 * (مثل «تبريز»)، پس پیش از مقایسه یکسان‌سازی می‌کنیم.
 */
function normalize(name: string): string {
  return name.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ');
}

/** کد ایستگاه را از روی نام پیدا می‌کند؛ اگر نبود `null`. */
export async function codeByName(name: string): Promise<number | null> {
  const stations = await getStations();
  const target = normalize(name);
  const exact = stations.find((s) => normalize(s.Name) === target);
  if (exact) return exact.Code;
  const partial = stations.find((s) => normalize(s.Name).includes(target));
  return partial?.Code ?? null;
}

/** نام ایستگاه از روی کد. */
export async function nameByCode(code: number): Promise<string | null> {
  const stations = await getStations();
  return stations.find((s) => s.Code === code)?.Name ?? null;
}
