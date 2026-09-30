import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

// Lunes de una semana futura respecto al reloj real (hoy: 2026-09-29), dentro
// del horizonte de reserva por defecto (8 semanas). Ver `.specs/003-reserva-publica/spec.md`.
const MONDAY = '2026-10-05';

describe('Slots (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedTemplateSlots(prisma);
    await seedPreferences(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin weekStart responde 400 sin code', async () => {
    const res = await request(app.getHttpServer()).get('/api/slots');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Falta weekStart' });
  });

  it('devuelve los cupos de lunes a sábado, ninguno el domingo', async () => {
    const res = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
    expect(res.status).toBe(200);
    const dates = new Set(res.body.slots.map((s: { date: string }) => s.date));
    expect(dates.size).toBe(6);
    expect(dates.has('2026-10-11')).toBe(false); // domingo de esa semana

    // 5 días × 2 horas + 3 del sábado = 13
    expect(res.body.slots).toHaveLength(13);
    const saturdaySlots = res.body.slots.filter((s: { date: string }) => s.date === '2026-10-10');
    expect(saturdaySlots).toHaveLength(3);
  });

  it('un DayBlock del día completo no emite ningún slot ese día', async () => {
    await prisma.dayBlock.create({ data: { date: new Date('2026-10-06T00:00:00Z') } }); // martes
    const res = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
    const tuesdaySlots = res.body.slots.filter((s: { date: string }) => s.date === '2026-10-06');
    expect(tuesdaySlots).toHaveLength(0);
    expect(res.body.slots).toHaveLength(11);
  });

  it('un SlotBlock puntual marca solo ese cupo como no disponible', async () => {
    await prisma.slotBlock.create({ data: { date: new Date('2026-10-06T00:00:00Z'), time: '19:00' } });
    const res = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
    const blocked = res.body.slots.find(
      (s: { date: string; time: string }) => s.date === '2026-10-06' && s.time === '19:00',
    );
    const sibling = res.body.slots.find(
      (s: { date: string; time: string }) => s.date === '2026-10-06' && s.time === '20:00',
    );
    expect(blocked.available).toBe(false);
    expect(sibling.available).toBe(true);
  });

  it('una semana más allá del horizonte devuelve todos los slots con available: false', async () => {
    // bookingHorizonWeeks: 0 hace que el límite sea el lunes actual de la
    // máquina de test, siempre antes de MONDAY (2026-10-05) sin importar cuándo
    // se corra la suite.
    await seedPreferences(prisma, { bookingHorizonWeeks: 0 });
    const res = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
    const allUnavailable = res.body.slots.every((s: { available: boolean }) => s.available === false);
    expect(allUnavailable).toBe(true);
  });

  it('una sesión CANCELLED en ese startsAt no bloquea el cupo (historial no cuenta)', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'hist@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
    });
    const startsAt = slotStartsAtIso(MONDAY, '19:00');
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(startsAt),
        status: 'CANCELLED',
        confirmToken: 'a'.repeat(48),
        cancelToken: 'b'.repeat(48),
        createdBy: 'GUARDIAN',
      },
    });

    const res = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
    const slot = res.body.slots.find(
      (s: { date: string; time: string }) => s.date === MONDAY && s.time === '19:00',
    );
    expect(slot.available).toBe(true);
  });

  it('una sesión PENDING/CONFIRMED en ese startsAt ocupa el cupo', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'ocupado@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
    });
    const startsAt = slotStartsAtIso(MONDAY, '20:00');
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(startsAt),
        status: 'PENDING',
        confirmToken: 'c'.repeat(48),
        cancelToken: 'd'.repeat(48),
        createdBy: 'GUARDIAN',
      },
    });

    const res = await request(app.getHttpServer()).get(`/api/slots?weekStart=${MONDAY}`);
    const slot = res.body.slots.find(
      (s: { date: string; time: string }) => s.date === MONDAY && s.time === '20:00',
    );
    expect(slot.available).toBe(false);
  });
});
