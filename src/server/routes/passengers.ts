/** مسیرهای پروفایل مسافران */
import type { FastifyInstance } from 'fastify';
import { passengerSchema } from '../../config/schema.js';
import { passengers } from '../../db/repositories.js';

export async function passengerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/passengers', async () => passengers.list());

  app.post('/api/passengers', async (request) =>
    passengers.create(passengerSchema.parse(request.body)),
  );

  app.put<{ Params: { id: string } }>('/api/passengers/:id', async (request, reply) => {
    const updated = passengers.update(
      Number(request.params.id),
      passengerSchema.parse(request.body),
    );
    return updated ?? reply.code(404).send({ error: 'مسافر پیدا نشد.' });
  });

  app.delete<{ Params: { id: string } }>('/api/passengers/:id', async (request) => {
    passengers.remove(Number(request.params.id));
    return { ok: true };
  });
}
