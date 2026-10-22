/**
 * نقطه‌ی شروع.
 *
 * ترتیب: دیتابیس → سرور. مرورگر تنبل بالا می‌آید — تا وقتی رصدی شروع نشده
 * پنجره‌ای باز نمی‌شود.
 */
import { migrate } from './db/index.js';
import { closeBrowser } from './raja/browser.js';
import { startServer } from './server/app.js';
import { beginShutdown, resumeWatches, runningWatchIds, stopWatch } from './hunter/runner.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('main');

migrate();
const app = await startServer();

// رصدهایی که هنگام خاموش شدن فعال بودند خودشان ادامه پیدا می‌کنند
const resumed = resumeWatches();
if (resumed > 0) log.info(`${resumed} رصد از اجرای قبلی ادامه یافت`);

/** خاموش شدن تمیز: رصدها را متوقف کن، مرورگر و سرور را ببند. */
async function shutdown(signal: string): Promise<void> {
  log.info(`دریافت ${signal}، در حال خاموش شدن`);

  /*
   * وضعیت `running` عمداً در دیتابیس دست‌نخورده می‌ماند تا اجرای بعدی
   * بتواند همان رصدها را ادامه دهد؛ فقط حلقه‌ی حافظه‌ای متوقف می‌شود.
   */
  beginShutdown();
  for (const id of runningWatchIds()) stopWatch(id);
  await app.close().catch(() => undefined);
  await closeBrowser();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
