import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

describe('Panel notifications (e2e)', () => {
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
    await seedEducator(prisma);
    const login = await request(app.getHttpServer())
      .post('/api/panel/auth/login')
      .send({ email: 'loreto@example.com', password: 'clave12345678' });
    token = login.body.token;

    const guardian = await prisma.guardian.create({
      data: { name: 'Camila', email: 'camila@correo.cl', phone: '+56922222222' },
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
  const list = () =>
    request(app.getHttpServer()).get('/api/panel/notifications').set('Authorization', auth());
  const seen = () =>
    request(app.getHttpServer()).post('/api/panel/notifications/seen').set('Authorization', auth());

  const publicBooking = (time: string, overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .send({
        startsAt: slotStartsAtIso('2026-10-05', time),
        guardianName: 'Ana Pérez',
        email: 'ana@correo.cl',
        phone: '+56911111111',
        childName: 'Sofía',
        childAge: 8,
        ...overrides,
      });

  const panelSession = (time: string) =>
    request(app.getHttpServer())
      .post('/api/panel/sessions')
      .set('Authorization', auth())
      .send({ childId, startsAt: slotStartsAtIso('2026-10-06', time) });

  it('sin actividad devuelve vacío', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], unreadCount: 0 });
  });

  it('una reserva pública aparece como no leída', async () => {
    const booked = await publicBooking('19:00');
    expect(booked.status).toBe(201);

    const res = await list();
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      kind: 'CREATED',
      actor: 'GUARDIAN',
      sessionId: booked.body.session.id,
      childName: 'Sofía',
      startsAt: slotStartsAtIso('2026-10-05', '19:00'),
      unread: true,
    });
  });

  it('una cita creada desde el panel no genera aviso', async () => {
    const created = await panelSession('19:00');
    expect(created.status).toBe(201);

    const res = await list();
    expect(res.body).toEqual({ items: [], unreadCount: 0 });
  });

  it('confirmar o cancelar por enlace agrega el cambio de estado', async () => {
    const booked = await publicBooking('19:00');
    await request(app.getHttpServer()).post(`/api/sessions/confirm/${booked.body.session.confirmToken}`);

    const res = await list();
    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual(['CONFIRMED', 'CREATED']);
    expect(res.body.unreadCount).toBe(2);
  });

  it('seen deja unreadCount en 0 y una reserva posterior lo sube a 1', async () => {
    await publicBooking('19:00');
    expect((await list()).body.unreadCount).toBe(1);

    const marked = await seen();
    expect(marked.status).toBe(204);

    const afterSeen = await list();
    expect(afterSeen.body.unreadCount).toBe(0);
    expect(afterSeen.body.items).toHaveLength(1);
    expect(afterSeen.body.items[0].unread).toBe(false);

    await publicBooking('20:00', { email: 'otra@correo.cl', childName: 'Luz' });
    const afterNew = await list();
    expect(afterNew.body.unreadCount).toBe(1);
    expect(afterNew.body.items.filter((i: { unread: boolean }) => i.unread)).toHaveLength(1);
  });

  it('seen guarda la marca en la educadora', async () => {
    const before = await prisma.educator.findFirstOrThrow();
    expect(before.notificationsSeenAt).toBeNull();

    await seen();
    const after = await prisma.educator.findFirstOrThrow();
    expect(after.notificationsSeenAt).toBeInstanceOf(Date);
  });

  it('devuelve como máximo 20 avisos pero cuenta todos los no leídos', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'Pedro', email: 'pedro@correo.cl', phone: '+56933333333' },
    });
    const kid = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Tomás', normalizedName: 'tomás', age: 7 },
    });
    const base = new Date('2026-12-01T22:00:00.000Z').getTime();
    await prisma.session.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        childId: kid.id,
        guardianId: guardian.id,
        startsAt: new Date(base + i * 3_600_000),
        status: 'PENDING' as const,
        confirmToken: crypto.randomUUID().replace(/-/g, ''),
        cancelToken: crypto.randomUUID().replace(/-/g, ''),
        createdBy: 'GUARDIAN' as const,
      })),
    });

    const res = await list();
    expect(res.body.items).toHaveLength(20);
    expect(res.body.unreadCount).toBe(25);
  });

  describe('autenticación', () => {
    it('GET sin token responde 401 NO_SESSION', async () => {
      const res = await request(app.getHttpServer()).get('/api/panel/notifications');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('POST seen sin token responde 401 NO_SESSION', async () => {
      const res = await request(app.getHttpServer()).post('/api/panel/notifications/seen');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('un token de apoderado no pasa', async () => {
      const created = await publicBooking('19:00', {
        email: 'cuenta@correo.cl',
        createAccount: { password: 'clave12345678' },
      });
      const res = await request(app.getHttpServer())
        .get('/api/panel/notifications')
        .set('Authorization', `Bearer ${created.body.auth.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });
  });
});
