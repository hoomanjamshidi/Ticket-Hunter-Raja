/**
 * پخش زنده‌ی تصویر مرورگر خودکار به داشبورد، و برگرداندن ورودی کاربر به آن.
 *
 * مرورگر headless است و هیچ پنجره‌ای روی سیستم باز نمی‌کند؛ در عوض با
 * پروتکل CDP فریم‌های JPEG می‌گیریم و روی WebSocket می‌فرستیم. کلیک و تایپ
 * کاربر هم از همان مسیر برمی‌گردد و روی صفحه اجرا می‌شود.
 *
 * نتیجه: کاربر مرورگر را داخل خود اپ می‌بیند و در لحظه‌ی رسیدن به درگاه
 * بانک، پرداخت را همان‌جا تمام می‌کند.
 */
import type { CDPSession, Page } from 'playwright';
import { createLogger } from '../utils/logger.js';
import { currentPage, getPage, onPageChanged, VIEWPORT } from './browser.js';

const log = createLogger('raja:screencast');

/** فریمی که به داشبورد می‌رود */
export interface Frame {
  type: 'frame';
  /** تصویر JPEG به صورت base64 */
  data: string;
  width: number;
  height: number;
  url: string;
}

type FrameListener = (frame: Frame) => void;

const listeners = new Set<FrameListener>();
let session: CDPSession | null = null;
let attachedTo: Page | null = null;
let lastFrame: Frame | null = null;

/** کیفیت تصویر: تعادل بین خوانا بودن متن فارسی و حجم ترافیک */
const QUALITY = 60;

/** به تب اصلی وصل می‌شود و پخش فریم‌ها را شروع می‌کند. */
async function attach(target: Page): Promise<void> {
  if (attachedTo === target && session) return;
  await detach();

  session = await target.context().newCDPSession(target);
  attachedTo = target;

  session.on('Page.screencastFrame', (event) => {
    // بدون تأیید، کروم فریم بعدی را نمی‌فرستد
    void session
      ?.send('Page.screencastFrameAck', { sessionId: event.sessionId })
      .catch(() => undefined);

    const frame: Frame = {
      type: 'frame',
      data: event.data,
      width: event.metadata.deviceWidth ?? VIEWPORT.width,
      height: event.metadata.deviceHeight ?? VIEWPORT.height,
      url: target.url(),
    };
    lastFrame = frame;

    for (const listener of listeners) {
      try {
        listener(frame);
      } catch {
        // یک بیننده‌ی خراب نباید پخش را قطع کند
      }
    }
  });

  await session.send('Page.startScreencast', {
    format: 'jpeg',
    quality: QUALITY,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });

  log.info('پخش تصویر مرورگر شروع شد');
}

/** قطع اتصال از تب فعلی. */
async function detach(): Promise<void> {
  if (!session) return;
  await session.send('Page.stopScreencast').catch(() => undefined);
  await session.detach().catch(() => undefined);
  session = null;
  attachedTo = null;
}

// اگر مرورگر بسته یا دوباره باز شد، خودکار همگام شو
onPageChanged((next) => {
  if (next) void attach(next).catch(() => undefined);
  else void detach();
});

/**
 * یک بیننده‌ی تازه اضافه می‌کند.
 * اگر مرورگر بالا نباشد بالا می‌آید، و آخرین فریم فوراً فرستاده می‌شود تا
 * کاربر منتظر تغییر بعدی صفحه نماند.
 */
export async function subscribe(listener: FrameListener): Promise<() => void> {
  listeners.add(listener);

  const target = currentPage() ?? (await getPage());
  await attach(target);

  if (lastFrame) listener(lastFrame);

  return () => {
    listeners.delete(listener);
    // آخرین بیننده که رفت، پخش را نگه دار تا ترافیک بیهوده نرود
    if (listeners.size === 0) void detach();
  };
}

// ─── ورودی کاربر ────────────────────────────────────────────────────────────

/** رویدادهایی که داشبورد می‌تواند بفرستد */
export type InputEvent =
  | { kind: 'click'; x: number; y: number; button?: 'left' | 'right' | 'middle'; clickCount?: number }
  | { kind: 'move'; x: number; y: number }
  | { kind: 'scroll'; x: number; y: number; deltaY: number }
  | { kind: 'type'; text: string }
  | { kind: 'key'; key: string }
  | { kind: 'navigate'; url: string }
  | { kind: 'back' }
  | { kind: 'forward' }
  | { kind: 'reload' };

/**
 * رویداد کاربر را روی صفحه اجرا می‌کند.
 *
 * مختصات از سمت داشبورد بر حسب همان اندازه‌ی viewport می‌آیند؛ فرانت خودش
 * مقیاس تصویر را به مختصات واقعی تبدیل کرده است.
 */
export async function applyInput(event: InputEvent): Promise<void> {
  const target = currentPage();
  if (!target) return;

  switch (event.kind) {
    case 'click':
      await target.mouse.click(event.x, event.y, {
        button: event.button ?? 'left',
        clickCount: event.clickCount ?? 1,
      });
      break;
    case 'move':
      await target.mouse.move(event.x, event.y);
      break;
    case 'scroll':
      await target.mouse.move(event.x, event.y);
      await target.mouse.wheel(0, event.deltaY);
      break;
    case 'type':
      await target.keyboard.insertText(event.text);
      break;
    case 'key':
      await target.keyboard.press(event.key);
      break;
    case 'navigate':
      await target.goto(event.url, { waitUntil: 'domcontentloaded' });
      break;
    case 'back':
      await target.goBack().catch(() => undefined);
      break;
    case 'forward':
      await target.goForward().catch(() => undefined);
      break;
    case 'reload':
      await target.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      break;
  }
}

/** آدرس فعلی تب اصلی، برای نوار آدرس داشبورد. */
export function currentUrl(): string {
  return currentPage()?.url() ?? '';
}
