import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

const MONDAY = '2026-10-05';

describe('Panel agenda (e2e)', () => {
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

  function get(weekStart = MONDAY) {
    return request(app.getHttpServer())
      .get(`/api/panel/agenda?weekStart=${weekStart}`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('sin Bearer responde 401', async () => {
    const res = await request(app.getHttpServer()).get(`/api/panel/agenda?weekStart=${MONDAY}`);
    expect(res.status).toBe(401);
  });

  it('sin weekStart responde 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/panel/agenda')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('weekStart que no es lunes responde 400 VALIDATION_ERROR', async () => {
    const res = await get('2026-10-06');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve los 7 días de la semana, domingo incluido', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days.map((d: { date: string }) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('un día bloqueado marca dayBlocked:true y sus celdas BLOCKED_DAY', async () => {
    await prisma.dayBlock.create({ data: { date: new Date('2026-10-06T00:00:00Z') } });
    const res = await get();
    const tuesday = res.body.days.find((d: { date: string }) => d.date === '2026-10-06');
    expect(tuesday.dayBlocked).toBe(true);
    expect(tuesday.cells.every((c: { state: string }) => c.state === 'BLOCKED_DAY')).toBe(true);
  });

  it('una sesión activa dentro de un día bloqueado se ve BOOKED, no desaparece', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'a@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño', normalizedName: 'niño', age: 8 },
    });
    const startsAt = slotStartsAtIso('2026-10-06', '19:00');
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(startsAt),
        status: 'PENDING',
        confirmToken: 'a'.repeat(48),
        cancelToken: 'b'.repeat(48),
        createdBy: 'EDUCATOR',
      },
    });
    await prisma.dayBlock.create({ data: { date: new Date('2026-10-06T00:00:00Z') } });

    const res = await get();
    const tuesday = res.body.days.find((d: { date: string }) => d.date === '2026-10-06');
    const cell = tuesday.cells.find((c: { time: string }) => c.time === '19:00');
    expect(cell.state).toBe('BOOKED');
    expect(cell.session.childName).toBe('Niño');
    // dayBlocked queda true a nivel de día aunque esta celda esté BOOKED.
    expect(tuesday.dayBlocked).toBe(true);
  });

  it('una sesión fuera de la plantilla vigente sigue visible como candidato BOOKED', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'A', email: 'b@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño2', normalizedName: 'niño2', age: 8 },
    });
    // 17:00 no está en la plantilla (L-V es 19:00/20:00).
    const startsAt = slotStartsAtIso('2026-10-06', '17:00');
    await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(startsAt),
        status: 'PENDING',
        confirmToken: 'c'.repeat(48),
        cancelToken: 'd'.repeat(48),
        createdBy: 'EDUCATOR',
      },
    });

    const res = await get();
    const tuesday = res.body.days.find((d: { date: string }) => d.date === '2026-10-06');
    const cell = tuesday.cells.find((c: { time: string }) => c.time === '17:00');
    expect(cell).toBeDefined();
    expect(cell.state).toBe('BOOKED');
  });
});
