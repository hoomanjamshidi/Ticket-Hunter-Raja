/** مسیرهای مدیریت رصدها */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { watchInputSchema } from '../../config/schema.js';
import { offers, runs, watches } from '../../db/repositories.js';
import { forgetWatch, isRunning, startWatch, stopWatch } from '../../hunter/runner.js';
import { expandDateRange, normalizeJalali } from '../../utils/jalali.js';
import { stageOf } from '../../hunter/stages.js';

/**
 * ورودی داشبورد می‌تواند به جای فهرست تاریخ، یک بازه بدهد.
 * بازه همین‌جا باز می‌شود تا بقیه‌ی سیستم فقط با فهرست سروکار داشته باشد.
 */
const bodySchema = watchInputSchema.extend({
  dates: z.array(z.string()).default([]),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

function resolveDates(body: z.infer<typeof bodySchema>): string[] {
  if (body.dateFrom && body.dateTo) {
    return expandDateRange(body.dateFrom, body.dateTo);
  }
  return body.dates.map(normalizeJalali);
}

export async function watchRoutes(app: FastifyInstance): Promise<void> {
  /** فهرست رصدها، به همراه اینکه کدام‌ها همین حالا در حال اجرا هستند */
  app.get('/api/watches', async () =>
    watches.list().map((watch) => ({
      ...watch,
      running: isRunning(watch.id),
      stage: stageOf(watch.id),
    })),
  );

  app.post('/api/watches', async (request, reply) => {
    const body = bodySchema.parse(request.body);
    const dates = resolveDates(body);
    if (dates.length === 0) {
      return reply.code(400).send({ error: 'حداقل یک تاریخ لازم است.' });
    }
    return watches.create({ ...body, dates });
  });

  app.put<{ Params: { id: string } }>('/api/watches/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const body = bodySchema.parse(request.body);
    const dates = resolveDates(body);
    if (dates.length === 0) {
      return reply.code(400).send({ error: 'حداقل یک تاریخ لازم است.' });
    }
    const updated = watches.update(id, { ...body, dates });
    return updated ?? reply.code(404).send({ error: 'رصد پیدا نشد.' });
  });

  app.delete<{ Params: { id: string } }>('/api/watches/:id', async (request) => {
    const id = Number(request.params.id);
    forgetWatch(id);
    watches.remove(id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/watches/:id/start', async (request, reply) => {
    const id = Number(request.params.id);
    if (!watches.get(id)) return reply.code(404).send({ error: 'رصد پیدا نشد.' });
    return { started: startWatch(id) };
  });

  app.post<{ Params: { id: string } }>('/api/watches/:id/stop', async (request) => ({
    stopped: stopWatch(Number(request.params.id)),
  }));

  /** تاریخچه‌ی چرخه‌ها */
  app.get<{ Params: { id: string } }>('/api/watches/:id/runs', async (request) =>
    runs.recent(Number(request.params.id)),
  );

  /** بلیت‌های دیده‌شده */
  app.get<{ Params: { id: string } }>('/api/watches/:id/offers', async (request) =>
    offers.latest(Number(request.params.id)),
  );
}
