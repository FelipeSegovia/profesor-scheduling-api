import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { hash } from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso, weekMondayYmd } from '../src/domain/time.js';
import { OutboxDispatcherService } from '../src/outbox/outbox-dispatcher.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { FakeEmailSender } from './helpers/fake-email-sender.js';
import { seedEducator, seedPreferences } from './helpers/fixtures.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lunes de la semana siguiente, 19:00 en Chile: siempre entre 1 y 7 días adelante. */
function nextMondayAt(time: string): string {
  return slotStartsAtIso(weekMondayYmd(new Date(Date.now() + 7 * DAY_MS)), time);
}

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    startsAt: nextMondayAt('19:00'),
    guardianName: 'Ana Pérez',
    email: 'ana@correo.cl',
    phone: '+56911111111',
    childName: 'Sofía',
    childAge: 8,
    ...overrides,
  };
}

describe('Despacho del outbox (e2e, spec 006)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dispatcher: OutboxDispatcherService;
  const sender = new FakeEmailSender();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ emailSender: sender }));
    dispatcher = app.get(OutboxDispatcherService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedPreferences(prisma); // 24 h de plazo: la reserva nace PENDING
    await seedEducator(prisma, { email: 'loreto@example.com' });
    sender.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  async function book(overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer()).post('/api/bookings').send(bookingBody(overrides));
    expect(res.status).toBe(201);
    return prisma.session.findUniqueOrThrow({ where: { id: res.body.session.id } });
  }

  it('con NODE_ENV=test no registra el intervalo', () => {
    expect(app.get(SchedulerRegistry).getIntervals()).not.toContain('outbox-dispatch');
  });

  it('envía la reserva pendiente con Confirmo / No puedo y deja la fila SENT', async () => {
    const session = await book();

    const result = await dispatcher.dispatchOnce();

    expect(result).toEqual({ sent: 1, retried: 0, failed: 0, skipped: 0 });
    expect(sender.sent).toHaveLength(1);
    const [email] = sender.sent;
    expect(email.to).toBe('ana@correo.cl');
    expect(email.subject).toContain('Confirma la sesión de Sofía');
    expect(email.html).toContain(`http://localhost:5173/sesion/${session.confirmToken}/confirmar`);
    expect(email.html).toContain(`http://localhost:5173/sesion/${session.cancelToken}/cancelar`);

    const row = await prisma.outboxEmail.findFirstOrThrow();
    expect(email.idempotencyKey).toBe(row.id);
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, providerId: 'fake-1', error: null });
    expect(row.sentAt).toBeInstanceOf(Date);

    // Un segundo ciclo no vuelve a enviarla.
    await dispatcher.dispatchOnce();
    expect(sender.sent).toHaveLength(1);
  });

  it('al confirmar por enlace avisa al apoderado y a la educadora', async () => {
    const session = await book();
    await dispatcher.dispatchOnce();
    sender.reset();

    await request(app.getHttpServer()).post(`/api/sessions/confirm/${session.confirmToken}`).expect(200);
    await dispatcher.dispatchOnce();

    const byRecipient = Object.fromEntries(sender.sent.map((e) => [e.to, e]));
    expect(Object.keys(byRecipient).sort()).toEqual(['ana@correo.cl', 'loreto@example.com']);
    expect(byRecipient['ana@correo.cl'].subject).toContain('Sesión confirmada');
    expect(byRecipient['loreto@example.com'].subject).toBe('Ana Pérez confirmó la sesión de Sofía');
  });

  it('si el envío falla reintenta con backoff y al 5.º fallo queda FAILED', async () => {
    await book();
    const now = new Date();

    sender.failNext(1);
    expect(await dispatcher.dispatchOnce(now)).toEqual({ sent: 0, retried: 1, failed: 0, skipped: 0 });
    let row = await prisma.outboxEmail.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, error: 'fallo simulado del proveedor' });
    expect(row.nextAttemptAt.getTime()).toBe(now.getTime() + 60_000);

    // Antes de que venza la espera, la fila no se toma.
    expect(await dispatcher.dispatchOnce(now)).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 0 });

    // Cuatro fallos más, siempre después de la espera vigente.
    sender.failNext(4);
    for (let i = 0; i < 4; i++) {
      row = await prisma.outboxEmail.findFirstOrThrow();
      await dispatcher.dispatchOnce(row.nextAttemptAt);
    }
    row = await prisma.outboxEmail.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'FAILED', attempts: 5 });
    expect(sender.sent).toHaveLength(0);
  });

  it('un fallo en una fila no corta el resto del lote', async () => {
    await book({ email: 'uno@correo.cl', startsAt: nextMondayAt('19:00') });
    await book({ email: 'dos@correo.cl', startsAt: nextMondayAt('20:00') });

    sender.failNext(1);
    const result = await dispatcher.dispatchOnce();

    expect(result).toEqual({ sent: 1, retried: 1, failed: 0, skipped: 0 });
    expect(sender.sent.map((e) => e.to)).toEqual(['dos@correo.cl']);
  });

  it('omite el correo al apoderado de una cita que ya pasó, sin llamar al sender', async () => {
    const guardian = await prisma.guardian.create({
      data: { name: 'Ana', email: 'ana@correo.cl', phone: '+56911111111' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Sofía', normalizedName: 'sofía', age: 8 },
    });
    const session = await prisma.session.create({
      data: {
        childId: child.id,
        guardianId: guardian.id,
        startsAt: new Date(Date.now() - DAY_MS),
        status: 'PENDING',
        confirmToken: 'tok-confirm-pasada',
        cancelToken: 'tok-cancel-pasada',
        createdBy: 'GUARDIAN',
      },
    });
    await prisma.outboxEmail.create({
      data: { kind: 'BOOKING_PENDING', recipient: guardian.email, sessionId: session.id },
    });

    expect(await dispatcher.dispatchOnce()).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 1 });
    expect(sender.sent).toHaveLength(0);
    const row = await prisma.outboxEmail.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'SKIPPED', error: 'session already started' });
  });

  describe('SYSTEM_CONFIRMED (requisito 7)', () => {
    it('una reserva pública que nace confirmada avisa también a la educadora', async () => {
      // Un plazo mayor que la distancia a la cita deja el plazo ya vencido.
      await seedPreferences(prisma, { confirmationDeadlineHours: 100_000 });
      const session = await book();
      expect(session.status).toBe('CONFIRMED');

      const rows = await prisma.outboxEmail.findMany({ orderBy: { kind: 'asc' } });
      expect(rows.map((r) => [r.kind, r.recipient])).toEqual([
        ['BOOKING_CONFIRMED', 'ana@correo.cl'],
        ['SYSTEM_CONFIRMED', 'loreto@example.com'],
      ]);

      await dispatcher.dispatchOnce();
      const toEducator = sender.sent.find((e) => e.to === 'loreto@example.com');
      expect(toEducator?.subject).toContain('Nueva sesión confirmada: Sofía');
      expect(toEducator?.text).toContain('Ana Pérez reservó una sesión para Sofía');
    });

    it('una reserva pública que nace pendiente no avisa a la educadora', async () => {
      await book();
      const rows = await prisma.outboxEmail.findMany();
      expect(rows.map((r) => r.kind)).toEqual(['BOOKING_PENDING']);
    });

    it('una cita confirmada creada desde el panel no avisa a la educadora', async () => {
      await seedPreferences(prisma, { confirmationDeadlineHours: 100_000 });
      const login = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });
      const guardian = await prisma.guardian.create({
        data: { name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' },
      });
      const child = await prisma.child.create({
        data: { guardianId: guardian.id, name: 'Mateo', normalizedName: 'mateo', age: 8 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ childId: child.id, startsAt: nextMondayAt('19:00') });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CONFIRMED');

      const rows = await prisma.outboxEmail.findMany();
      expect(rows.map((r) => [r.kind, r.recipient])).toEqual([['BOOKING_CONFIRMED', 'camila@correo.cl']]);
    });
  });

  describe('restablecer clave (requisito 5)', () => {
    it('con cuenta envía el enlace directo, sin pasar por el outbox', async () => {
      await prisma.guardian.create({
        data: {
          name: 'Ana Pérez',
          email: 'ana@correo.cl',
          phone: '+56911111111',
          passwordHash: await hash('clave12345678'),
        },
      });

      const res = await request(app.getHttpServer()).post('/api/auth/forgot').send({ email: 'ana@correo.cl' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // El envío no se espera en la respuesta.
      await vi.waitFor(() => expect(sender.sent).toHaveLength(1));
      const [email] = sender.sent;
      expect(email.to).toBe('ana@correo.cl');
      expect(email.subject).toBe('Restablece la clave de tu cuenta');
      expect(email.html).toContain(`http://localhost:5173/cuenta/restablecer/${res.body.devResetToken}`);
      expect(email.text).toContain('60 minutos');
      expect(await prisma.outboxEmail.count()).toBe(0);
    });

    it('sin cuenta no envía nada y responde igual', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/forgot').send({ email: 'nadie@correo.cl' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(sender.sent).toHaveLength(0);
    });

    it('si el envío falla la respuesta no cambia', async () => {
      await prisma.guardian.create({
        data: {
          name: 'Ana Pérez',
          email: 'ana@correo.cl',
          phone: '+56911111111',
          passwordHash: await hash('clave12345678'),
        },
      });
      sender.failNext(1);

      const res = await request(app.getHttpServer()).post('/api/auth/forgot').send({ email: 'ana@correo.cl' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.devResetToken).toEqual(expect.any(String));
    });
  });

  it('una fila sin sesión queda FAILED', async () => {
    await prisma.outboxEmail.create({ data: { kind: 'CONFIRMED', recipient: 'ana@correo.cl' } });

    expect(await dispatcher.dispatchOnce()).toEqual({ sent: 0, retried: 0, failed: 1, skipped: 0 });
    const row = await prisma.outboxEmail.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'FAILED', error: 'session not found' });
  });

  describe('CLINICAL_NOTE (spec 007)', () => {
    /** Niño con apoderado, un registro y su fila del outbox, sin pasar por el servicio. */
    async function seedNote() {
      const guardian = await prisma.guardian.create({
        data: { name: 'Ana Pérez', email: 'ana@correo.cl', phone: '+56911111111' },
      });
      const child = await prisma.child.create({
        data: { guardianId: guardian.id, name: 'Sofía', normalizedName: 'sofia', age: 8 },
      });
      const note = await prisma.clinicalNote.create({
        data: {
          childId: child.id,
          date: new Date('2026-10-05T00:00:00Z'),
          title: 'Trabajamos lectura',
          body: 'Practicó sílabas.',
          guardianNotified: true,
        },
      });
      await prisma.outboxEmail.create({
        data: { kind: 'CLINICAL_NOTE', recipient: guardian.email, clinicalNoteId: note.id },
      });
      return { note };
    }

    it('envía el registro al apoderado y deja la fila SENT', async () => {
      await seedNote();

      expect(await dispatcher.dispatchOnce()).toEqual({ sent: 1, retried: 0, failed: 0, skipped: 0 });

      const [email] = sender.sent;
      expect(email.to).toBe('ana@correo.cl');
      expect(email.subject).toBe('Nuevo registro en la ficha de Sofía');
      expect(email.text).toContain('lunes 5 de octubre');
      expect(email.text).toContain('Trabajamos lectura');
      expect(email.text).toContain('Practicó sílabas.');
      const row = await prisma.outboxEmail.findFirstOrThrow();
      expect(row).toMatchObject({ status: 'SENT', attempts: 1, error: null });
    });

    it('envía el contenido al momento del despacho, no el de cuando se creó', async () => {
      const { note } = await seedNote();
      await prisma.clinicalNote.update({
        where: { id: note.id },
        data: { title: 'Título corregido', body: 'Texto corregido.' },
      });

      await dispatcher.dispatchOnce();

      expect(sender.sent[0].text).toContain('Título corregido');
      expect(sender.sent[0].text).toContain('Texto corregido.');
      expect(sender.sent[0].text).not.toContain('Practicó sílabas.');
    });

    it('si el registro se borró antes del envío, la fila queda SKIPPED sin llamar al sender', async () => {
      const { note } = await seedNote();
      await prisma.clinicalNote.delete({ where: { id: note.id } });

      expect(await dispatcher.dispatchOnce()).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 1 });

      expect(sender.sent).toHaveLength(0);
      const row = await prisma.outboxEmail.findFirstOrThrow();
      expect(row).toMatchObject({ status: 'SKIPPED', error: 'clinical note deleted' });
    });

    it('un registro de una fecha pasada igual se envía (no es una invitación a asistir)', async () => {
      const { note } = await seedNote();
      await prisma.clinicalNote.update({
        where: { id: note.id },
        data: { date: new Date('2020-01-06T00:00:00Z') },
      });

      expect(await dispatcher.dispatchOnce()).toEqual({ sent: 1, retried: 0, failed: 0, skipped: 0 });
    });

    it('una fila CLINICAL_NOTE sin clinicalNoteId se omite en vez de fallar', async () => {
      await prisma.outboxEmail.create({ data: { kind: 'CLINICAL_NOTE', recipient: 'ana@correo.cl' } });

      expect(await dispatcher.dispatchOnce()).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 1 });
    });
  });
});
