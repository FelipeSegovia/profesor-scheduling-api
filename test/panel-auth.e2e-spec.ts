import { INestApplication } from '@nestjs/common';
import { hash } from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences } from './helpers/fixtures.js';

describe('Panel auth (e2e) — educadora', () => {
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

  describe('POST /api/panel/auth/login', () => {
    it('credenciales correctas responde 200 con token y perfil', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });
      expect(res.status).toBe(200);
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.educator.email).toBe('loreto@example.com');
    });

    it('clave incorrecta responde 401 INVALID_CREDENTIALS', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'otra-clave' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('email inexistente responde 401 INVALID_CREDENTIALS (no distingue el caso)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'nadie@example.com', password: 'clave12345678' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('campos faltantes responde 400 MISSING_FIELDS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: '', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });
  });

  describe('GET /api/panel/auth/me', () => {
    it('sin Bearer responde 401 NO_SESSION', async () => {
      const res = await request(app.getHttpServer()).get('/api/panel/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('con Bearer válido devuelve el perfil', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const login = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });

      const res = await request(app.getHttpServer())
        .get('/api/panel/auth/me')
        .set('Authorization', `Bearer ${login.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.educator.email).toBe('loreto@example.com');
    });
  });

  describe('Aislamiento de tokens entre superficies', () => {
    it('un token de apoderado responde 401 NO_SESSION en /api/panel/auth/me', async () => {
      const passwordHash = await hash('clave12345678');
      await prisma.guardian.create({
        data: { name: 'Ana', email: 'ana@correo.cl', phone: '+56911111111', passwordHash },
      });
      const guardianLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ana@correo.cl', password: 'clave12345678' });
      expect(guardianLogin.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get('/api/panel/auth/me')
        .set('Authorization', `Bearer ${guardianLogin.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });

    it('un token de educadora responde 401 NO_SESSION en /api/auth/me (superficie del apoderado)', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const educatorLogin = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });
      expect(educatorLogin.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${educatorLogin.body.token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_SESSION');
    });
  });

  describe('POST /api/panel/auth/password', () => {
    it('invalida el token anterior y el nuevo sirve', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const login = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });
      const oldToken = login.body.token as string;

      const changed = await request(app.getHttpServer())
        .post('/api/panel/auth/password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ currentPassword: 'clave12345678', newPassword: 'clave-nueva-987' });
      expect(changed.status).toBe(200);
      const newToken = changed.body.token as string;
      expect(newToken).not.toBe(oldToken);

      const withOldToken = await request(app.getHttpServer())
        .get('/api/panel/auth/me')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(withOldToken.status).toBe(401);

      const withNewToken = await request(app.getHttpServer())
        .get('/api/panel/auth/me')
        .set('Authorization', `Bearer ${newToken}`);
      expect(withNewToken.status).toBe(200);
    });

    it('clave actual incorrecta responde 401 INVALID_CREDENTIALS', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const login = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });

      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/password')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ currentPassword: 'clave-equivocada', newPassword: 'clave-nueva-987' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('clave nueva corta responde 400 WEAK_PASSWORD', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const login = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });

      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/password')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ currentPassword: 'clave12345678', newPassword: '123' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WEAK_PASSWORD');
    });
  });

  describe('POST /api/panel/auth/logout', () => {
    it('responde 204 con Bearer válido', async () => {
      await seedEducator(prisma, { email: 'loreto@example.com', password: 'clave12345678' });
      const login = await request(app.getHttpServer())
        .post('/api/panel/auth/login')
        .send({ email: 'loreto@example.com', password: 'clave12345678' });

      const res = await request(app.getHttpServer())
        .post('/api/panel/auth/logout')
        .set('Authorization', `Bearer ${login.body.token}`);
      expect(res.status).toBe(204);
    });

    it('sin Bearer responde 401 (logout exige sesión, a diferencia del apoderado)', async () => {
      const res = await request(app.getHttpServer()).post('/api/panel/auth/logout');
      expect(res.status).toBe(401);
    });
  });
});
