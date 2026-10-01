import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

const MONDAY = '2026-10-05';

describe('Panel sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let childId: string;
  let guardianId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedTemplateSlots(prisma);
    await seedPreferences(prisma);
    await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
    const login = await request(app.getHttpServer())
      .post('/api/panel/auth/login')
      .send({ email: 'loreto@example.com', password: 'clave12345678' });
    token = login.body.token;

    const guardian = await prisma.guardian.create({
      data: { name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Mateo', normalizedName: 'mateo', age: 8 },
    });
    guardianId = guardian.id;
    childId = child.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  describe('POST /api/panel/sessions', () => {
    it('crea una sesión con estado según el plazo vigente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.childId).toBe(childId);
      expect(res.body.guardianId).toBe(guardianId);
    });

    it('se acepta fuera de la plantilla vigente (17:00 no está en L-V)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '17:00') });
      expect(res.status).toBe(201);
    });

    it('niño inexistente responde 404 CHILD_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId: 'no-existe', startsAt: slotStartsAtIso(MONDAY, '19:00') });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CHILD_NOT_FOUND');
    });

    it('cupo con sesión activa responde 409 SLOT_TAKEN', async () => {
      const startsAt = slotStartsAtIso(MONDAY, '19:00');
      await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt });
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });

    it('cupo bloqueado responde 409 SLOT_BLOCKED', async () => {
      await prisma.slotBlock.create({ data: { date: new Date(`${MONDAY}T00:00:00Z`), time: '19:00' } });
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_BLOCKED');
    });

    it('hora pasada responde 400 PAST_SLOT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: '2020-01-01T22:00:00.000Z' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAST_SLOT');
    });

    it('no escribe ningún OutboxEmail dirigido a la educadora', async () => {
      await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });
      const rows = await prisma.outboxEmail.findMany();
      expect(rows.every((r) => r.recipient !== 'loreto@example.com')).toBe(true);
    });
  });

  describe('PATCH /api/panel/sessions/:id/move', () => {
    it('libera el cupo anterior y la sesión queda en el nuevo horario', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });

      const moved = await request(app.getHttpServer())
        .patch(`/api/panel/sessions/${created.body.id}/move`)
        .set('Authorization', auth())
        .send({ startsAt: slotStartsAtIso(MONDAY, '20:00') });
      expect(moved.status).toBe(200);
      expect(moved.body.time).toBe('20:00');

      const freed = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
      const slot = freed.body.slots.find(
        (s: { date: string; time: string }) => s.date === MONDAY && s.time === '19:00',
      );
      expect(slot.available).toBe(true);
    });

    it('mover a una hora con plazo ya vencido deja la sesión CONFIRMED', async () => {
      await seedPreferences(prisma, { confirmationDeadlineHours: 100_000 });
      const created = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });
      expect(created.body.status).toBe('CONFIRMED');

      const moved = await request(app.getHttpServer())
        .patch(`/api/panel/sessions/${created.body.id}/move`)
        .set('Authorization', auth())
        .send({ startsAt: slotStartsAtIso(MONDAY, '20:00') });
      expect(moved.body.status).toBe('CONFIRMED');
    });

    it('sesión inexistente responde 404 SESSION_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/panel/sessions/no-existe/move')
        .set('Authorization', auth())
        .send({ startsAt: slotStartsAtIso(MONDAY, '20:00') });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('POST /api/panel/sessions/:id/confirm', () => {
    it('marca CONFIRMED una sesión PENDING', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });

      const res = await request(app.getHttpServer())
        .post(`/api/panel/sessions/${created.body.id}/confirm`)
        .set('Authorization', auth());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CONFIRMED');
    });

    it('sobre una sesión CANCELLED responde 409 NOT_PENDING', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });
      await request(app.getHttpServer())
        .post(`/api/panel/sessions/${created.body.id}/cancel`)
        .set('Authorization', auth());

      const res = await request(app.getHttpServer())
        .post(`/api/panel/sessions/${created.body.id}/confirm`)
        .set('Authorization', auth());
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOT_PENDING');
    });
  });

  describe('POST /api/panel/sessions/:id/cancel', () => {
    it('cancela una sesión activa y libera el cupo', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', auth())
        .send({ childId, startsAt: slotStartsAtIso(MONDAY, '19:00') });

      const res = await request(app.getHttpServer())
        .post(`/api/panel/sessions/${created.body.id}/cancel`)
        .set('Authorization', auth());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');

      const freed = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
      const slot = freed.body.slots.find(
        (s: { date: string; time: string }) => s.date === MONDAY && s.time === '19:00',
      );
      expect(slot.available).toBe(true);
    });
  });
});
