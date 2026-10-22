/**
 * نمای زنده‌ی مرورگر خودکار، داخل خود اپ.
 *
 * مرورگر headless است و هیچ پنجره‌ای روی سیستم باز نمی‌کند؛ تصویرش به صورت
 * فریم‌های JPEG روی WebSocket می‌آید و کلیک و تایپ کاربر از همان مسیر
 * برمی‌گردد. پرداخت نهایی هم همین‌جا انجام می‌شود.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MousePointerClick, RotateCw } from 'lucide-react';
import { Banner, Button, Card } from '../components/ui';
import './BrowserView.css';

/** اندازه‌ی واقعی صفحه‌ی مرورگر در سرور — مبنای تبدیل مختصات */
const VIEWPORT = { width: 1280, height: 800 };

type Frame = { type: 'frame'; data: string; width: number; height: number; url: string };
type ErrorMessage = { type: 'error'; message: string };

export function BrowserView() {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  /** وقتی روشن است، کلیک و تایپ کاربر به مرورگر فرستاده می‌شود */
  const [interactive, setInteractive] = useState(true);
  const socket = useRef<WebSocket | null>(null);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let retry: number | undefined;
    let closed = false;

    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${location.host}/ws/browser`);
      socket.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };
      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data as string) as Frame | ErrorMessage;
          if (payload.type === 'frame') setFrame(payload);
          else if (payload.type === 'error') setError(payload.message);
        } catch {
          // پیام ناخوانا را نادیده بگیر
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = window.setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      socket.current?.close();
    };
  }, []);

  const send = useCallback((event: unknown): void => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  /** مختصات کلیک روی تصویر را به مختصات واقعی صفحه تبدیل می‌کند. */
  const toPageCoords = useCallback((clientX: number, clientY: number) => {
    const box = image.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return {
      x: Math.round(((clientX - box.left) / box.width) * VIEWPORT.width),
      y: Math.round(((clientY - box.top) / box.height) * VIEWPORT.height),
    };
  }, []);

  // تایپ کاربر وقتی نما فعال است
  useEffect(() => {
    if (!interactive) return;

    const onKey = (event: KeyboardEvent): void => {
      // اگر کاربر در فیلدی از خود داشبورد تایپ می‌کند، دخالت نکن
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        send({ kind: 'type', text: event.key });
      } else if (
        ['Backspace', 'Enter', 'Tab', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        send({ kind: 'key', key: event.key });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, send]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>مرورگر</h1>
        <div className="browser-actions">
          <Button onClick={() => send({ kind: 'back' })} title="صفحه قبل">
            <ArrowRight size={15} aria-hidden="true" />
          </Button>
          <Button onClick={() => send({ kind: 'forward' })} title="صفحه بعد">
            <ArrowLeft size={15} aria-hidden="true" />
          </Button>
          <Button onClick={() => send({ kind: 'reload' })} title="بارگذاری دوباره">
            <RotateCw size={15} aria-hidden="true" />
          </Button>
          <Button
            variant={interactive ? 'primary' : 'ghost'}
            onClick={() => setInteractive((v) => !v)}
            title="با خاموش کردن، کلیک‌های شما به مرورگر فرستاده نمی‌شود"
          >
            <MousePointerClick size={15} aria-hidden="true" />
            {interactive ? 'کنترل فعال' : 'فقط تماشا'}
          </Button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <Card>
        <div className="browser-bar">
          <span className={`browser-dot${connected ? ' is-on' : ''}`} aria-hidden="true" />
          <span className="browser-url" dir="ltr">
            {frame?.url ?? (connected ? 'در حال آماده‌سازی مرورگر…' : 'اتصال قطع است')}
          </span>
        </div>

        <div className="browser-stage">
          {frame ? (
            <img
              ref={image}
              className={`browser-frame${interactive ? ' is-interactive' : ''}`}
              src={`data:image/jpeg;base64,${frame.data}`}
              alt="نمای زنده‌ی مرورگر خودکار"
              draggable={false}
              onClick={(event) => {
                if (!interactive) return;
                const point = toPageCoords(event.clientX, event.clientY);
                if (point) send({ kind: 'click', ...point });
              }}
              onWheel={(event) => {
                if (!interactive) return;
                const point = toPageCoords(event.clientX, event.clientY);
                if (point) send({ kind: 'scroll', ...point, deltaY: event.deltaY });
              }}
            />
          ) : (
            <div className="browser-placeholder">
              {connected ? 'مرورگر در حال بالا آمدن است…' : 'در انتظار اتصال به سرور'}
            </div>
          )}
        </div>

        <p className="field-hint browser-note">
          این مرورگر داخل همین برنامه اجرا می‌شود و پنجره‌ای روی سیستم شما باز نمی‌کند.
          وقتی رصد به درگاه بانک رسید، پرداخت را همین‌جا تکمیل کنید.
        </p>
      </Card>
    </div>
  );
}
