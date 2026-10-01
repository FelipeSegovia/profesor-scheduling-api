import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

describe('Panel series (e2e) — POST /api/panel/series', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let childId: string;

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
    childId = child.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;

  it('crea una sesión por cada ocurrencia del weekday en el rango', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId, weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(4); // martes: 06, 13, 20, 27 de octubre
    expect(res.body.skipped).toEqual([]);
  });

  it('salta fechas ya ocupadas y las reporta con reason OCCUPIED', async () => {
    // Ocupa el martes 13 de antemano.
    await request(app.getHttpServer())
      .post('/api/panel/sessions')
      .set('Authorization', auth())
      .send({ childId, startsAt: slotStartsAtIso('2026-10-13', '19:00') });

    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId, weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(3);
    expect(res.body.skipped).toEqual([{ date: '2026-10-13', reason: 'OCCUPIED' }]);
  });

  it('salta fechas con día bloqueado y las reporta con reason DAY_BLOCKED', async () => {
    await prisma.dayBlock.create({ data: { date: new Date('2026-10-20T00:00:00Z') } });

    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId, weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
    expect(res.body.skipped).toEqual([{ date: '2026-10-20', reason: 'DAY_BLOCKED' }]);
  });

  it('salta fechas con cupo bloqueado y las reporta con reason SLOT_BLOCKED', async () => {
    await prisma.slotBlock.create({ data: { date: new Date('2026-10-06T00:00:00Z'), time: '19:00' } });

    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId, weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
    expect(res.body.skipped).toEqual([{ date: '2026-10-06', reason: 'SLOT_BLOCKED' }]);
  });

  it('sin ninguna fecha válida responde 400 SERIES_EMPTY y no crea la Series', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId, weekday: 3, time: '19:00', startDate: '2020-01-01', endDate: '2020-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SERIES_EMPTY');
    expect(await prisma.series.count()).toBe(0);
  });

  it('niño inexistente responde 404 CHILD_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId: 'no-existe', weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CHILD_NOT_FOUND');
  });

  it('las sesiones creadas quedan ligadas a la Series', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/panel/series')
      .set('Authorization', auth())
      .send({ childId, weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
    const sessions = await prisma.session.findMany({ where: { seriesId: res.body.seriesId } });
    expect(sessions).toHaveLength(4);
  });
});
