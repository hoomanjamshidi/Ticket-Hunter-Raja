/**
 * لاگ ساختاریافته.
 *
 * علاوه بر چاپ در ترمینال، هر رویداد را به شنونده‌ها (WebSocket داشبورد)
 * هم پخش می‌کند تا کاربر زنده ببیند ربات چه می‌کند.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  /** حوزه‌ی رویداد، مثلاً `raja:auth` یا `hunter:runner` */
  scope: string;
  message: string;
  /** شناسه‌ی watch مربوطه، اگر رویداد به یک رصد خاص مربوط باشد */
  watchId?: number;
  data?: Record<string, unknown>;
  at: string;
}

type Listener = (event: LogEvent) => void;

const listeners = new Set<Listener>();

/** برای پخش لاگ روی WebSocket. تابع لغو اشتراک برمی‌گرداند. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel: LogLevel = process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info';

function emit(event: LogEvent): void {
  if (LEVEL_ORDER[event.level] >= LEVEL_ORDER[minLevel]) {
    const time = event.at.slice(11, 19);
    const suffix = event.data ? ` ${JSON.stringify(event.data)}` : '';
    // eslint-disable-next-line no-console -- لاگ ترمینال، خروجی عمدی است
    console.log(`${time} [${event.level}] ${event.scope}: ${event.message}${suffix}`);
  }
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // یک شنونده‌ی خراب نباید جریان لاگ را قطع کند
    }
  }
}

/** یک لاگر با حوزه‌ی مشخص می‌سازد: `const log = createLogger('raja:auth')` */
export function createLogger(scope: string) {
  const write =
    (level: LogLevel) =>
    (message: string, data?: Record<string, unknown>, watchId?: number): void => {
      emit({ level, scope, message, data, watchId, at: new Date().toISOString() });
    };

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
  };
}
