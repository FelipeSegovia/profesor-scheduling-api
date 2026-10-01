import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

const MONDAY = '2026-10-05';

describe('Panel schedule (e2e) — GET /panel/preferences', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin Bearer responde 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/panel/preferences');
    expect(res.status).toBe(401);
  });

  it('devuelve workWeek derivado de la plantilla y los tres plazos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/panel/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.confirmationDeadlineHours).toBe(24);
    expect(res.body.seriesNoticeHours).toBe(48);
    expect(res.body.bookingHorizonWeeks).toBe(8);

    const monday = res.body.workWeek.find((d: { weekday: number }) => d.weekday === 1);
    expect(monday).toMatchObject({ available: true, start: '19:00', end: '21:00', contiguous: true });

    const saturday = res.body.workWeek.find((d: { weekday: number }) => d.weekday === 6);
    expect(saturday).toMatchObject({ available: true, start: '09:00', end: '12:00', contiguous: true });

    const sunday = res.body.workWeek.find((d: { weekday: number }) => d.weekday === 0);
    expect(sunday).toMatchObject({ available: false, start: null, end: null });
  });
});

describe('Panel schedule (e2e) — PUT /panel/preferences', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  it('actualiza los tres plazos cuando son válidos', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/panel/preferences')
      .set('Authorization', auth())
      .send({ confirmationDeadlineHours: 12, seriesNoticeHours: 36, bookingHorizonWeeks: 6 });
    expect(res.status).toBe(200);
    expect(res.body.confirmationDeadlineHours).toBe(12);
    expect(res.body.seriesNoticeHours).toBe(36);
  });

  it('seriesNoticeHours <= confirmationDeadlineHours responde 400 y no guarda nada', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/panel/preferences')
      .set('Authorization', auth())
      .send({ confirmationDeadlineHours: 24, seriesNoticeHours: 24, bookingHorizonWeeks: 8 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PREFERENCES');

    const prefs = await prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
    expect(prefs.confirmationDeadlineHours).toBe(24);
    expect(prefs.seriesNoticeHours).toBe(48); // valor sembrado, sin tocar
  });
});

describe('Panel schedule (e2e) — PUT /panel/template', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  const fullWeek = (overrides: Record<number, { available: boolean; start: string | null; end: string | null }>) =>
    Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      available: overrides[weekday]?.available ?? false,
      start: overrides[weekday]?.start ?? null,
      end: overrides[weekday]?.end ?? null,
    }));

  it('reemplaza la plantilla y no toca ninguna sesión existente', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'a@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
    });
    // Lunes 19:00 sí está en la plantilla actual.
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(slotStartsAtIso(MONDAY, '19:00')),
        status: 'PENDING',
        confirmToken: 'a'.repeat(48),
        cancelToken: 'b'.repeat(48),
        createdBy: 'EDUCATOR',
      },
    });

    const res = await request(app.getHttpServer())
      .put('/api/panel/template')
      .set('Authorization', auth())
      .send({ workWeek: fullWeek({ 1: { available: true, start: '10:00', end: '12:00' } }) });
    expect(res.status).toBe(200);
    // La sesión sigue existiendo, aunque 19:00 ya no esté en la plantilla nueva.
    const session = await prisma.session.findFirst({ where: { childId: child.id } });
    expect(session).not.toBeNull();
    expect(res.body.orphanSessions).toBe(1);

    const monday = res.body.workWeek.find((d: { weekday: number }) => d.weekday === 1);
    expect(monday).toMatchObject({ start: '10:00', end: '12:00' });
  });
});

describe('Panel schedule (e2e) — bloqueos', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  it('bloquea y desbloquea un día vacío', async () => {
    const blocked = await request(app.getHttpServer())
      .post('/api/panel/blocks/day')
      .set('Authorization', auth())
      .send({ date: MONDAY });
    expect(blocked.status).toBe(201);
    expect(await prisma.dayBlock.count()).toBe(1);

    const unblocked = await request(app.getHttpServer())
      .delete(`/api/panel/blocks/day/${MONDAY}`)
      .set('Authorization', auth());
    expect(unblocked.status).toBe(204);
    expect(await prisma.dayBlock.count()).toBe(0);
  });

  it('desbloquear un día que no estaba bloqueado responde 204', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/panel/blocks/day/${MONDAY}`)
      .set('Authorization', auth());
    expect(res.status).toBe(204);
  });

  it('bloquear un día con una sesión activa responde 409 SLOT_NOT_EMPTY', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'a@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
    });
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(slotStartsAtIso(MONDAY, '19:00')),
        status: 'PENDING',
        confirmToken: 'a'.repeat(48),
        cancelToken: 'b'.repeat(48),
        createdBy: 'EDUCATOR',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/panel/blocks/day')
      .set('Authorization', auth())
      .send({ date: MONDAY });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLOT_NOT_EMPTY');
  });

  it('bloquea y desbloquea un cupo puntual vacío', async () => {
    const blocked = await request(app.getHttpServer())
      .post('/api/panel/blocks/slot')
      .set('Authorization', auth())
      .send({ date: MONDAY, time: '19:00' });
    expect(blocked.status).toBe(201);
    expect(await prisma.slotBlock.count()).toBe(1);

    const unblocked = await request(app.getHttpServer())
      .delete(`/api/panel/blocks/slot/${MONDAY}/19:00`)
      .set('Authorization', auth());
    expect(unblocked.status).toBe(204);
    expect(await prisma.slotBlock.count()).toBe(0);
  });

  it('bloquear un cupo con sesión activa responde 409, sin afectar el cupo vecino', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'a@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
    });
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(slotStartsAtIso(MONDAY, '19:00')),
        status: 'PENDING',
        confirmToken: 'a'.repeat(48),
        cancelToken: 'b'.repeat(48),
        createdBy: 'EDUCATOR',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/panel/blocks/slot')
      .set('Authorization', auth())
      .send({ date: MONDAY, time: '19:00' });
    expect(res.status).toBe(409);

    const sibling = await request(app.getHttpServer())
      .post('/api/panel/blocks/slot')
      .set('Authorization', auth())
      .send({ date: MONDAY, time: '20:00' });
    expect(sibling.status).toBe(201);
  });
});
