import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

// Lunes de una semana futura (ver test/slots.e2e-spec.ts): todo instante de
// este día es "futuro" respecto al reloj real de la máquina de test.
const MONDAY = '2026-10-05';

async function createSession(
  prisma: PrismaService,
  opts: { date: string; time: string; status: 'PENDING' | 'CONFIRMED'; email: string },
) {
  const guardian = await prisma.guardian.create({
    data: { name: 'Apoderado', email: opts.email, phone: '+56911111111' },
  });
  const child = await prisma.child.create({
    data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
  });
  return prisma.session.create({
    data: {
      childId: child.id,
      guardianId: guardian.id,
      startsAt: new Date(slotStartsAtIso(opts.date, opts.time)),
      status: opts.status,
      confirmToken: Math.random().toString(36).repeat(2).slice(0, 48),
      cancelToken: Math.random().toString(36).repeat(2).slice(0, 48),
      createdBy: 'EDUCATOR',
    },
  });
}

describe('Panel dashboard (e2e) — GET /panel/summary', () => {
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
    const res = await request(app.getHttpServer()).get(`/api/panel/summary?date=${MONDAY}`);
    expect(res.status).toBe(401);
  });

  it('calcula las 4 métricas con datos sembrados', async () => {
    await createSession(prisma, { date: MONDAY, time: '19:00', status: 'PENDING', email: 'a@correo.cl' });
    await createSession(prisma, { date: MONDAY, time: '20:00', status: 'CONFIRMED', email: 'b@correo.cl' });
    // Fuera de la semana de MONDAY (sábado siguiente), pero futuro igual: debe
    // contar en "pending" (sin tope de semana) pero no en "confirmed" ni "today".
    await createSession(prisma, {
      date: '2026-10-17',
      time: '19:00',
      status: 'PENDING',
      email: 'c@correo.cl',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/panel/summary?date=${MONDAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(MONDAY);
    expect(res.body.stats.today).toBe(2); // las dos sesiones del lunes
    expect(res.body.stats.confirmed).toBe(1); // solo la CONFIRMED, dentro de la semana
    expect(res.body.stats.pending).toBe(2); // ambas PENDING, sin tope de semana
    expect(res.body.stats.families).toBe(3); // 3 apoderados distintos con sesión activa futura
    expect(res.body.todaySessions).toHaveLength(2);
  });

  it('cada ítem de activity trae el startsAt de su cita', async () => {
    const session = await createSession(prisma, {
      date: MONDAY,
      time: '19:00',
      status: 'PENDING',
      email: 'a@correo.cl',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/panel/summary?date=${MONDAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const items = res.body.activity.filter((a: { sessionId: string }) => a.sessionId === session.id);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.startsAt).toBe(session.startsAt.toISOString());
    }
  });

  it('attention incluye solo PENDING dentro del plazo de confirmación', async () => {
    await seedPreferences(prisma, { confirmationDeadlineHours: 24 });
    // slotStartsAtIso(MONDAY, '19:00') está a más de 24h del "ahora" real de
    // test (la suite corre bastante antes de 2026-10-05), así que no debería
    // caer en "attention" salvo que el reloj de test esté a menos de 24h.
    const far = await createSession(prisma, {
      date: '2026-11-01',
      time: '19:00',
      status: 'PENDING',
      email: 'lejos@correo.cl',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/panel/summary?date=${MONDAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.attention.some((s: { id: string }) => s.id === far.id)).toBe(false);
  });

  it('nextFreeSlot es el primer cupo libre de la semana pedida', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/panel/summary?date=${MONDAY}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.nextFreeSlot).not.toBeNull();
    expect(res.body.nextFreeSlot.date).toBe(MONDAY);
    expect(res.body.nextFreeSlot.time).toBe('19:00');
    expect(res.body.nextFreeSlot.state).toBe('FREE');
  });

  it('sin date usa hoy por defecto', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/panel/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.today).toEqual(expect.any(String));
  });
});
