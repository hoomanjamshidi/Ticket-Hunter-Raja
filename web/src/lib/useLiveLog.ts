/**
 * اتصال به لاگ زنده‌ی سرور روی WebSocket.
 * اگر اتصال قطع شد خودش دوباره وصل می‌شود؛ رصد ممکن است ساعت‌ها طول بکشد.
 */
import { useEffect, useRef, useState } from 'react';

export interface LogEvent {
  channel?: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  watchId?: number;
  data?: Record<string, unknown>;
  at: string;
}

/** وضعیت مرحله‌ای که از همان WebSocket می‌آید */
export interface StageMessage {
  channel: 'stage';
  watchId: number;
  stage: string;
  label: string;
  detail: string;
  at: string;
  nextInSec?: number;
}

const MAX_EVENTS = 300;

export function useLiveLog(): {
  events: LogEvent[];
  stages: Record<number, StageMessage>;
  connected: boolean;
} {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [stages, setStages] = useState<Record<number, StageMessage>>({});
  const [connected, setConnected] = useState(false);
  const retry = useRef<number>();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;

    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws`);

      socket.onopen = () => setConnected(true);
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data as string) as LogEvent | StageMessage;
          if (payload.channel === 'stage') {
            setStages((previous) => ({ ...previous, [payload.watchId]: payload }));
          } else {
            setEvents((previous) => [payload as LogEvent, ...previous].slice(0, MAX_EVENTS));
          }
        } catch {
          // پیام ناخوانا را نادیده بگیر
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry.current = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry.current);
      socket?.close();
    };
  }, []);

  return { events, stages, connected };
}
