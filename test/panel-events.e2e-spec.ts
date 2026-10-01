import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Subscription } from 'rxjs';
import { slotStartsAtIso } from '../src/domain/time.js';
import { SessionEventsService } from '../src/events/session-events.service.js';
import type { SessionEvent } from '../src/events/session-events.types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences, seedTemplateSlots } from './helpers/fixtures.js';

const STARTS_AT = slotStartsAtIso('2026-10-05', '19:00');

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    startsAt: STARTS_AT,
    guardianName: 'Ana Pérez',
    email: 'ana@correo.cl',
    phone: '+56911111111',
    childName: 'Sofía',
    childAge: 8,
    ...overrides,
  };
}

describe('Eventos de sesión (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let events: SessionEventsService;
  let received: SessionEvent[];
  let subscription: Subscription;
  let token: string;
  let childId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    events = app.get(SessionEventsService);
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
    received = [];
    subscription = events.stream().subscribe((e) => received.push(e));
  });

  afterEach(() => {
    subscription.unsubscribe();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${token}`;
  const panelCreate = (startsAt = STARTS_AT) =>
    request(app.getHttpServer())
      .post('/api/panel/sessions')
      .set('Authorization', auth())
      .send({ childId, startsAt });

  const book = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post('/api/bookings').send(bookingBody(overrides));

  describe('reserva pública', () => {
    it('POST /api/bookings emite CREATED con actor GUARDIAN', async () => {
      const res = await book();
      expect(res.status).toBe(201);

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        id: `${res.body.session.id}:CREATED`,
        kind: 'CREATED',
        sessionId: res.body.session.id,
        childName: 'Sofía',
        startsAt: STARTS_AT,
        actor: 'GUARDIAN',
      });
    });

    it('una reserva rechazada por SLOT_TAKEN no emite', async () => {
      await book();
      received.length = 0;

      const res = await book({ email: 'otra@correo.cl', childName: 'Mateo' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
      expect(received).toEqual([]);
    });

    it('una validación fallida no emite', async () => {
      const res = await book({ childAge: 2 });
      expect(res.status).toBe(400);
      expect(received).toEqual([]);
    });
  });

  describe('confirmar y cancelar por enlace', () => {
    it('confirmar emite CONFIRMED con actor GUARDIAN, y repetirlo no emite de nuevo', async () => {
      const created = await book();
      received.length = 0;

      const first = await request(app.getHttpServer()).post(
        `/api/sessions/confirm/${created.body.session.confirmToken}`,
      );
      expect(first.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        kind: 'CONFIRMED',
        sessionId: created.body.session.id,
        childName: 'Sofía',
        actor: 'GUARDIAN',
      });

      const again = await request(app.getHttpServer()).post(
        `/api/sessions/confirm/${created.body.session.confirmToken}`,
      );
      expect(again.status).toBe(200);
      expect(received).toHaveLength(1);
    });

    it('cancelar emite CANCELLED con actor GUARDIAN, y repetirlo no emite de nuevo', async () => {
      const created = await book();
      received.length = 0;

      const first = await request(app.getHttpServer()).post(
        `/api/sessions/cancel/${created.body.session.cancelToken}`,
      );
      expect(first.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        kind: 'CANCELLED',
        sessionId: created.body.session.id,
        actor: 'GUARDIAN',
      });

      await request(app.getHttpServer()).post(
        `/api/sessions/cancel/${created.body.session.cancelToken}`,
      );
      expect(received).toHaveLength(1);
    });

    it('el `at` del evento coincide con statusChangedAt guardado', async () => {
      const created = await book();
      received.length = 0;

      await request(app.getHttpServer()).post(
        `/api/sessions/confirm/${created.body.session.confirmToken}`,
      );
      const stored = await prisma.session.findUniqueOrThrow({
        where: { id: created.body.session.id },
      });
      expect(received[0].at).toBe(stored.statusChangedAt?.toISOString());
    });

    it('un token inválido no emite', async () => {
      const res = await request(app.getHttpServer()).post('/api/sessions/confirm/no-existe');
      expect(res.status).toBe(404);
      expect(received).toEqual([]);
    });
  });
  describe('acciones de la educadora en el panel', () => {
    it('crear una cita única emite CREATED con actor EDUCATOR', async () => {
      const res = await panelCreate();
      expect(res.status).toBe(201);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        kind: 'CREATED',
        sessionId: res.body.id,
        childName: 'Mateo',
        actor: 'EDUCATOR',
      });
    });

    it('una cita única rechazada por SLOT_TAKEN no emite', async () => {
      await panelCreate();
      received.length = 0;
      const res = await panelCreate();
      expect(res.status).toBe(409);
      expect(received).toEqual([]);
    });

    it('crear una serie emite un CREATED por cada sesión creada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/series')
        .set('Authorization', auth())
        .send({ childId, weekday: 2, time: '19:00', startDate: '2026-10-05', endDate: '2026-10-27' });
      expect(res.status).toBe(201);
      expect(res.body.created.length).toBeGreaterThan(1);
      expect(received).toHaveLength(res.body.created.length);
      expect(received.every((e) => e.kind === 'CREATED' && e.actor === 'EDUCATOR')).toBe(true);
      expect(new Set(received.map((e) => e.sessionId))).toEqual(
        new Set(res.body.created.map((c: { id: string }) => c.id)),
      );
    });

    it('mover emite MOVED con la nueva hora', async () => {
      const created = await panelCreate();
      received.length = 0;
      const newStartsAt = slotStartsAtIso('2026-10-06', '20:00');

      const res = await request(app.getHttpServer())
        .patch(`/api/panel/sessions/${created.body.id}/move`)
        .set('Authorization', auth())
        .send({ startsAt: newStartsAt });
      expect(res.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        kind: 'MOVED',
        sessionId: created.body.id,
        startsAt: newStartsAt,
        actor: 'EDUCATOR',
      });
    });

    it('marcar confirmada emite CONFIRMED con actor EDUCATOR', async () => {
      const created = await panelCreate();
      received.length = 0;

      const res = await request(app.getHttpServer())
        .post(`/api/panel/sessions/${created.body.id}/confirm`)
        .set('Authorization', auth());
      expect(res.status).toBeLessThan(300);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ kind: 'CONFIRMED', actor: 'EDUCATOR' });
    });

    it('cancelar emite CANCELLED con actor EDUCATOR', async () => {
      const created = await panelCreate();
      received.length = 0;

      const res = await request(app.getHttpServer())
        .post(`/api/panel/sessions/${created.body.id}/cancel`)
        .set('Authorization', auth());
      expect(res.status).toBeLessThan(300);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ kind: 'CANCELLED', actor: 'EDUCATOR' });
    });

    it('una acción rechazada (sesión inexistente) no emite', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/sessions/no-existe/cancel')
        .set('Authorization', auth());
      expect(res.status).toBe(404);
      expect(received).toEqual([]);
    });
  });
  describe('GET /api/panel/events (SSE por HTTP real)', () => {
    let baseUrl: string;

    beforeAll(async () => {
      await app.listen(0);
      const address = app.getHttpServer().address() as { port: number };
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    /** Lee el stream hasta que el texto acumulado cumpla `done`, o falla al agotar el tiempo. */
    async function readUntil(
      body: ReadableStream<Uint8Array>,
      done: (text: string) => boolean,
      timeoutMs = 4000,
    ): Promise<string> {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      const deadline = Date.now() + timeoutMs;
      while (!done(text)) {
        if (Date.now() > deadline) throw new Error(`Timeout leyendo el stream. Recibido: ${text}`);
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout leyendo el stream. Recibido: ${text}`)), timeoutMs),
          ),
        ]);
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text;
    }

    it('sin token responde 401 NO_SESSION y no abre el stream', async () => {
      const res = await request(app.getHttpServer()).get('/api/panel/events');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('con token de apoderado responde 401 NO_SESSION', async () => {
      const created = await book({
        email: 'cuenta@correo.cl',
        childName: 'Luz',
        createAccount: { password: 'clave12345678' },
      });
      const guardianToken = created.body.auth.token as string;

      const res = await request(app.getHttpServer())
        .get('/api/panel/events')
        .set('Authorization', `Bearer ${guardianToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('con token de educadora entrega `event: session` tras una reserva pública', async () => {
      const controller = new AbortController();
      try {
        const res = await fetch(`${baseUrl}/api/panel/events`, {
          headers: { Authorization: auth() },
          signal: controller.signal,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');

        const booked = await book();
        expect(booked.status).toBe(201);

        const text = await readUntil(res.body!, (t) => t.includes('event: session') && t.includes('\n\n'));
        expect(text).toContain(`id: ${booked.body.session.id}:CREATED`);
        const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
        expect(JSON.parse(dataLine!.slice('data: '.length))).toMatchObject({
          kind: 'CREATED',
          actor: 'GUARDIAN',
          sessionId: booked.body.session.id,
          childName: 'Sofía',
        });
      } finally {
        controller.abort();
      }
    });
  });
});
