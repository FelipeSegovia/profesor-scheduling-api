import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedPreferences } from './helpers/fixtures.js';

describe('Auth (e2e) — cuenta opcional del apoderado', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await seedPreferences(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('clave corta responde WEAK_PASSWORD incluso si además faltan otros campos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: '', password: '123', guardianName: '', phone: '' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WEAK_PASSWORD');
    });

    it('MISSING_FIELDS cuando la clave es válida pero faltan otros campos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: '', password: 'clave12345678', guardianName: '', phone: '' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('crea la cuenta y arranca sesión', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.profile.guardian.email).toBe('ana@correo.cl');
    });

    it('email que ya tiene cuenta → 409 ACCOUNT_EXISTS', async () => {
      const body = {
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      };
      await request(app.getHttpServer()).post('/api/auth/register').send(body);
      const res = await request(app.getHttpServer()).post('/api/auth/register').send(body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACCOUNT_EXISTS');
    });

    it('email que ya había reservado (sin cuenta) asocia la cuenta a ese Guardian', async () => {
      await request(app.getHttpServer()).post('/api/bookings').send({
        startsAt: '2026-10-05T22:00:00.000Z',
        guardianName: 'Ana',
        email: 'ana@correo.cl',
        phone: '+56911111111',
        childName: 'Sofía',
        childAge: 8,
      });
      expect(await prisma.guardian.count()).toBe(1);

      const res = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      expect(res.status).toBe(201);
      expect(await prisma.guardian.count()).toBe(1); // no se duplicó
      expect(res.body.profile.children).toHaveLength(1);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
    });

    it('credenciales correctas → 200 AuthResult', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ana@correo.cl', password: 'clave12345678' });
      expect(res.status).toBe(200);
      expect(res.body.token).toEqual(expect.any(String));
    });

    it('clave incorrecta → 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ana@correo.cl', password: 'incorrecta12345' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('email inexistente → mismo error que clave incorrecta', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'no-existe@correo.cl', password: 'cualquiera1234' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  it('POST /api/auth/logout responde 204 con o sin Bearer', async () => {
    const withoutToken = await request(app.getHttpServer()).post('/api/auth/logout');
    expect(withoutToken.status).toBe(204);

    const withToken = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer token-invalido');
    expect(withToken.status).toBe(204);
  });

  describe('GET /api/auth/me', () => {
    it('sin Bearer → 401 NO_SESSION', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('con Bearer inválido → 401 NO_SESSION', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer no-soy-un-token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('con Bearer válido → 200 con el perfil', async () => {
      const register = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${register.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.profile.guardian.email).toBe('ana@correo.cl');
    });
  });

  describe('GET /api/auth/email-status', () => {
    it('responde hasAccount: false para un email sin cuenta, siempre 200', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/email-status?email=nadie@correo.cl');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hasAccount: false });
    });

    it('responde hasAccount: true para un email con cuenta', async () => {
      await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      const res = await request(app.getHttpServer()).get('/api/auth/email-status?email=ana@correo.cl');
      expect(res.body).toEqual({ hasAccount: true });
    });
  });

  describe('POST /api/auth/forgot + POST /api/auth/reset', () => {
    it('forgot responde igual (200, ok:true) exista o no la cuenta', async () => {
      const withoutAccount = await request(app.getHttpServer())
        .post('/api/auth/forgot')
        .send({ email: 'nadie@correo.cl' });
      expect(withoutAccount.status).toBe(200);
      expect(withoutAccount.body.ok).toBe(true);
      expect(withoutAccount.body.devResetToken).toBeUndefined();

      await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      const withAccount = await request(app.getHttpServer())
        .post('/api/auth/forgot')
        .send({ email: 'ana@correo.cl' });
      expect(withAccount.status).toBe(200);
      expect(withAccount.body.ok).toBe(true);
      // NODE_ENV=test !== 'production': el token de dev viene en la respuesta.
      expect(withAccount.body.devResetToken).toEqual(expect.any(String));
    });

    it('reset con token inexistente → 400 INVALID_RESET', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/reset')
        .send({ token: 'no-existe', password: 'nueva12345678' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_RESET');
    });

    it('reset con token vencido → 400 INVALID_RESET', async () => {
      await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      const forgot = await request(app.getHttpServer())
        .post('/api/auth/forgot')
        .send({ email: 'ana@correo.cl' });
      const { hashToken } = await import('../src/common/tokens/random-token.js');
      await prisma.passwordReset.updateMany({
        where: { tokenHash: hashToken(forgot.body.devResetToken) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await request(app.getHttpServer())
        .post('/api/auth/reset')
        .send({ token: forgot.body.devResetToken, password: 'nueva12345678' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_RESET');
    });

    it('reset exitoso cambia la clave e invalida un JWT emitido antes', async () => {
      const register = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'ana@correo.cl',
        password: 'clave12345678',
        guardianName: 'Ana',
        phone: '+56911111111',
      });
      const oldToken = register.body.token;

      const forgot = await request(app.getHttpServer())
        .post('/api/auth/forgot')
        .send({ email: 'ana@correo.cl' });

      const reset = await request(app.getHttpServer())
        .post('/api/auth/reset')
        .send({ token: forgot.body.devResetToken, password: 'nuevaClave1234' });
      expect(reset.status).toBe(200);

      const meWithOldToken = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(meWithOldToken.status).toBe(401);
      expect(meWithOldToken.body.code).toBe('NO_SESSION');

      const loginWithNewPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ana@correo.cl', password: 'nuevaClave1234' });
      expect(loginWithNewPassword.status).toBe(200);
    });
  });
});
