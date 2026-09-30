import { INestApplication } from '@nestjs/common';
import { hash } from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { slotStartsAtIso } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedPreferences } from './helpers/fixtures.js';

const FUTURE_STARTS_AT = slotStartsAtIso('2026-10-05', '19:00');

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    startsAt: FUTURE_STARTS_AT,
    guardianName: 'Ana Pérez',
    email: 'ana@correo.cl',
    phone: '+56911111111',
    childName: 'Sofía',
    childAge: 8,
    ...overrides,
  };
}

describe('Bookings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedPreferences(prisma); // 24h de plazo por defecto: FUTURE_STARTS_AT nace PENDING
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/bookings — validaciones, en el orden del contrato', () => {
    it('INVALID_AGE cuando la edad está fuera de 3-13', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ childAge: 2 }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_AGE');
    });

    it('MISSING_FIELDS cuando falta un campo obligatorio', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ guardianName: '' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('INVALID_AGE gana sobre MISSING_FIELDS cuando aplican ambos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ childAge: 99, guardianName: '' }));
      expect(res.body.code).toBe('INVALID_AGE');
    });

    it('EMAIL_MISMATCH cuando el Bearer es de otra cuenta', async () => {
      const passwordHash = await hash('clave12345678');
      const guardian = await prisma.guardian.create({
        data: { name: 'Otro', email: 'otro@correo.cl', phone: '+56900000000', passwordHash },
      });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: guardian.email, password: 'clave12345678' });

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send(validBody({ email: 'ana@correo.cl' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('EMAIL_MISMATCH');
    });

    it('ACCOUNT_EXISTS cuando createAccount y el email ya tiene cuenta', async () => {
      const passwordHash = await hash('clave12345678');
      await prisma.guardian.create({
        data: { name: 'Ana', email: 'ana@correo.cl', phone: '+56911111111', passwordHash },
      });
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ createAccount: { password: 'nueva12345678' } }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACCOUNT_EXISTS');
    });

    it('WEAK_PASSWORD cuando createAccount trae una clave corta', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ createAccount: { password: '123' } }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WEAK_PASSWORD');
    });

    it('PAST_SLOT cuando startsAt ya pasó', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ startsAt: '2020-01-01T22:00:00.000Z' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAST_SLOT');
    });

    it('SLOT_TAKEN cuando ya hay una sesión activa en ese startsAt', async () => {
      await request(app.getHttpServer()).post('/api/bookings').send(validBody());
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ email: 'otra@correo.cl', childName: 'Otro niño' }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_TAKEN');
    });

    it('HELP_REQUEST_TOO_LONG cuando la nota supera 500 caracteres', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ helpRequest: 'a'.repeat(501) }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('HELP_REQUEST_TOO_LONG');
    });
  });

  describe('POST /api/bookings — creación y reglas de escritura', () => {
    it('crea Guardian/Child/Session y responde 201 con BookingResult', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').send(validBody());
      expect(res.status).toBe(201);
      expect(res.body.session.status).toBe('pendiente');
      expect(res.body.guardian.email).toBe('ana@correo.cl');
      expect(res.body.child.name).toBe('Sofía');
      expect(res.body.auth).toBeUndefined();

      const guardians = await prisma.guardian.count();
      const children = await prisma.child.count();
      const sessions = await prisma.session.count();
      expect(guardians).toBe(1);
      expect(children).toBe(1);
      expect(sessions).toBe(1);
    });

    it('reservar dos veces con el mismo email reutiliza el mismo Guardian', async () => {
      await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ startsAt: slotStartsAtIso('2026-10-05', '19:00') }));
      await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ startsAt: slotStartsAtIso('2026-10-05', '20:00'), childName: 'Otro' }));
      expect(await prisma.guardian.count()).toBe(1);
    });

    it('reserva anónima sobre email con cuenta existente no modifica el perfil', async () => {
      const passwordHash = await hash('clave12345678');
      const guardian = await prisma.guardian.create({
        data: { name: 'Nombre Original', email: 'ana@correo.cl', phone: '+56900000000', passwordHash },
      });

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ guardianName: 'Nombre Nuevo', phone: '+56911111111' }));

      expect(res.status).toBe(201);
      const unchanged = await prisma.guardian.findUniqueOrThrow({ where: { id: guardian.id } });
      expect(unchanged.name).toBe('Nombre Original');
      expect(unchanged.phone).toBe('+56900000000');
    });

    it('reserva con Bearer de la propia cuenta sí actualiza el perfil', async () => {
      const passwordHash = await hash('clave12345678');
      const guardian = await prisma.guardian.create({
        data: { name: 'Nombre Original', email: 'ana@correo.cl', phone: '+56900000000', passwordHash },
      });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: guardian.email, password: 'clave12345678' });

      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send(validBody({ guardianName: 'Nombre Nuevo', phone: '+56911111111' }));

      const updated = await prisma.guardian.findUniqueOrThrow({ where: { id: guardian.id } });
      expect(updated.name).toBe('Nombre Nuevo');
      expect(updated.phone).toBe('+56911111111');
    });

    it('createAccount crea la cuenta y arranca sesión (auth en la respuesta)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .send(validBody({ createAccount: { password: 'clave12345678' } }));
      expect(res.status).toBe(201);
      expect(res.body.auth).toBeDefined();
      expect(res.body.auth.token).toEqual(expect.any(String));
      expect(res.body.auth.profile.children).toHaveLength(1);

      const guardian = await prisma.guardian.findUniqueOrThrow({ where: { email: 'ana@correo.cl' } });
      expect(guardian.passwordHash).not.toBeNull();
    });

    it('nace CONFIRMED cuando el plazo ya venció, PENDING si no', async () => {
      // Un plazo mayor que la distancia real hasta FUTURE_STARTS_AT hace que
      // el "deadline" (startsAt - hoursBefore) ya haya quedado en el pasado.
      await seedPreferences(prisma, { confirmationDeadlineHours: 100_000 });
      const res = await request(app.getHttpServer()).post('/api/bookings').send(validBody());
      expect(res.body.session.status).toBe('confirmada');
    });

    it('deja exactamente una fila en OutboxEmail con el kind correcto', async () => {
      await request(app.getHttpServer()).post('/api/bookings').send(validBody());
      const rows = await prisma.outboxEmail.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe('BOOKING_PENDING');
    });

    it('dos reservas simultáneas sobre el mismo cupo: una gana, la otra SLOT_TAKEN', async () => {
      const startsAt = slotStartsAtIso('2026-10-05', '19:00');
      const [a, b] = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/api/bookings')
          .send(validBody({ startsAt, email: 'uno@correo.cl' })),
        request(app.getHttpServer())
          .post('/api/bookings')
          .send(validBody({ startsAt, email: 'dos@correo.cl' })),
      ]);

      const statuses = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);
      expect(await prisma.session.count()).toBe(1);
    });
  });

  describe('GET /api/bookings/:id', () => {
    it('devuelve la reserva existente sin auth', async () => {
      const created = await request(app.getHttpServer()).post('/api/bookings').send(validBody());
      const res = await request(app.getHttpServer()).get(`/api/bookings/${created.body.session.id}`);
      expect(res.status).toBe(200);
      expect(res.body.auth).toBeUndefined();
    });

    it('404 sin code para un id inexistente', async () => {
      const res = await request(app.getHttpServer()).get('/api/bookings/no-existe');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Reserva no encontrada' });
    });
  });
});
