/**
 * سرور محلی: REST برای داشبورد، WebSocket برای لاگ زنده، و سرو کردن
 * فایل‌های بیلدشده‌ی فرانت.
 *
 * این سرور فقط روی لوکال‌هاست بالا می‌آید — یک ابزار تک‌کاربره است.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { createLogger, subscribe } from '../utils/logger.js';
import { applyInput, currentUrl, subscribe as subscribeFrames, type InputEvent } from '../raja/screencast.js';
import { allStages, subscribeStages } from '../hunter/stages.js';
import { metaRoutes } from './routes/meta.js';
import { passengerRoutes } from './routes/passengers.js';
import { watchRoutes } from './routes/watches.js';

const log = createLogger('server');

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);

  /** خطاهای اعتبارسنجی zod را به پیام فارسی قابل‌نمایش تبدیل می‌کنیم. */
  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) {
      const first = (error as ZodError).issues[0];
      return reply.code(400).send({
        error: first ? `${first.path.join('.')}: ${first.message}` : 'ورودی نامعتبر است.',
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    log.error('خطای سرور', { error: message });
    return reply.code(500).send({ error: message });
  });

  await app.register(watchRoutes);
  await app.register(passengerRoutes);
  await app.register(metaRoutes);

  /**
   * پخش زنده‌ی لاگ‌ها و وضعیت مرحله‌ای به داشبورد.
   * هر اتصال، اشتراک خودش را دارد و هنگام قطع شدن لغو می‌شود.
   */
  app.register(async (instance) => {
    instance.get('/ws', { websocket: true }, (socket) => {
      const send = (payload: unknown): void => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
      };

      const offLog = subscribe((event) => send({ channel: 'log', ...event }));
      const offStage = subscribeStages((state) => send({ channel: 'stage', ...state }));

      // وضعیت فعلی همه‌ی رصدها را فوراً بفرست تا داشبورد منتظر تغییر بعدی نماند
      for (const state of allStages()) send({ channel: 'stage', ...state });

      const cleanup = (): void => {
        offLog();
        offStage();
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    });

    /**
     * پخش تصویر مرورگر و دریافت ورودی کاربر.
     *
     * کانال جدا از `/ws` است چون حجم فریم‌ها زیاد است و نباید جریان
     * لاگ و وضعیت را کند کند.
     */
    instance.get('/ws/browser', { websocket: true }, (socket) => {
      let unsubscribe: (() => void) | null = null;
      let closed = false;

      void subscribeFrames((frame) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
      })
        .then((off) => {
          // ممکن است تا آماده شدن مرورگر، اتصال بسته شده باشد
          if (closed) off();
          else unsubscribe = off;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          log.error('پخش تصویر مرورگر شروع نشد', { error: message });
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: 'error', message }));
          }
        });

      socket.on('message', (raw: Buffer) => {
        try {
          const event = JSON.parse(raw.toString()) as InputEvent;
          void applyInput(event).catch(() => undefined);
        } catch {
          // پیام ناخوانا را نادیده بگیر
        }
      });

      const cleanup = (): void => {
        closed = true;
        unsubscribe?.();
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    });
  });

  /** آدرس فعلی مرورگر خودکار، برای نوار آدرس داشبورد */
  app.get('/api/browser/url', async () => ({ url: currentUrl() }));

  // فرانت بیلدشده، اگر ساخته شده باشد
  const webDist = join(process.cwd(), 'web', 'dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // هر مسیر ناشناخته‌ای به اپ تک‌صفحه‌ای می‌رود
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'مسیر پیدا نشد.' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: '127.0.0.1' });
  log.info(`داشبورد آماده است: http://127.0.0.1:${env.PORT}`);
  return app;
}
