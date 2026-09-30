import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';

async function makeSession(
  prisma: PrismaService,
  overrides: Partial<{ status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NOT_CONFIRMED'; startsAt: Date }> = {},
) {
  const guardian = await prisma.guardian.create({
    data: { name: 'Ana', email: `${crypto.randomUUID()}@correo.cl`, phone: '+56911111111' },
  });
  const child = await prisma.child.create({
    data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
  });
  const session = await prisma.session.create({
    data: {
      childId: child.id,
      guardianId: guardian.id,
      startsAt: overrides.startsAt ?? new Date('2026-10-05T22:00:00.000Z'),
      status: overrides.status ?? 'PENDING',
      confirmToken: crypto.randomUUID().replace(/-/g, ''),
      cancelToken: crypto.randomUUID().replace(/-/g, ''),
      createdBy: 'GUARDIAN',
    },
  });
  return { guardian, child, session };
}

describe('Sessions (e2e) — confirmar y cancelar', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('confirmar', () => {
    it('token inválido → 404 INVALID_TOKEN', async () => {
      const res = await request(app.getHttpServer()).post('/api/sessions/confirm/no-existe');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('confirma una sesión pendiente y escribe OutboxEmail', async () => {
      const { session } = await makeSession(prisma, { status: 'PENDING' });
      const res = await request(app.getHttpServer()).post(`/api/sessions/confirm/${session.confirmToken}`);
      expect(res.status).toBe(200);
      expect(res.body.session.status).toBe('confirmada');
      const outbox = await prisma.outboxEmail.findMany({ where: { sessionId: session.id } });
      expect(outbox.map((o) => o.kind)).toEqual(['CONFIRMED']);
    });

    it('sobre una sesión CANCELLED/NOT_CONFIRMED → 409 NOT_PENDING', async () => {
      const { session } = await makeSession(prisma, { status: 'CANCELLED' });
      const res = await request(app.getHttpServer()).post(`/api/sessions/confirm/${session.confirmToken}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOT_PENDING');
    });

    it('confirmar una ya CONFIRMED es idempotente y no duplica OutboxEmail', async () => {
      const { session } = await makeSession(prisma, { status: 'CONFIRMED' });
      const res = await request(app.getHttpServer()).post(`/api/sessions/confirm/${session.confirmToken}`);
      expect(res.status).toBe(200);
      expect(res.body.session.status).toBe('confirmada');
      const outbox = await prisma.outboxEmail.findMany({ where: { sessionId: session.id } });
      expect(outbox).toHaveLength(0);
    });
  });

  describe('cancelar', () => {
    it('token inválido → 404 INVALID_TOKEN', async () => {
      const res = await request(app.getHttpServer()).post('/api/sessions/cancel/no-existe');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('cancela una sesión futura y escribe OutboxEmail', async () => {
      const { session } = await makeSession(prisma, {
        status: 'CONFIRMED',
        startsAt: new Date('2026-10-05T22:00:00.000Z'),
      });
      const res = await request(app.getHttpServer()).post(`/api/sessions/cancel/${session.cancelToken}`);
      expect(res.status).toBe(200);
      expect(res.body.session.status).toBe('cancelada');
      const outbox = await prisma.outboxEmail.findMany({ where: { sessionId: session.id } });
      expect(outbox.map((o) => o.kind)).toEqual(['CANCELLED']);
    });

    it('después de la hora de la cita → 409 CANCEL_NOT_ALLOWED', async () => {
      const { session } = await makeSession(prisma, {
        status: 'CONFIRMED',
        startsAt: new Date('2020-01-01T22:00:00.000Z'),
      });
      const res = await request(app.getHttpServer()).post(`/api/sessions/cancel/${session.cancelToken}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CANCEL_NOT_ALLOWED');
    });

    it('cancelar una ya CANCELLED es idempotente y no duplica OutboxEmail', async () => {
      const { session } = await makeSession(prisma, { status: 'CANCELLED' });
      const res = await request(app.getHttpServer()).post(`/api/sessions/cancel/${session.cancelToken}`);
      expect(res.status).toBe(200);
      expect(res.body.session.status).toBe('cancelada');
      const outbox = await prisma.outboxEmail.findMany({ where: { sessionId: session.id } });
      expect(outbox).toHaveLength(0);
    });
  });
});
