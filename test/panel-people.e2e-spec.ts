import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { truncateAll } from './helpers/db.js';
import { seedEducator, seedPreferences } from './helpers/fixtures.js';

describe('Panel people (e2e) — guardians/children', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateAll(prisma);
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

  const auth = () => `Bearer ${token}`;

  describe('POST /api/panel/guardians', () => {
    it('crea un apoderado', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe('camila@correo.cl');
    });

    it('email duplicado responde 409 GUARDIAN_EXISTS', async () => {
      await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });
      const res = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Otra', email: 'camila@correo.cl', phone: '+56922222222' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GUARDIAN_EXISTS');
    });
  });

  describe('POST /api/panel/guardians/:id/children', () => {
    it('acepta una edad fuera de 3-13', async () => {
      const guardian = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });

      const res = await request(app.getHttpServer())
        .post(`/api/panel/guardians/${guardian.body.id}/children`)
        .set('Authorization', auth())
        .send({ name: 'Mateo', age: 16 });
      expect(res.status).toBe(201);
      expect(res.body.age).toBe(16);
    });

    it('apoderado inexistente responde 404 GUARDIAN_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/panel/guardians/no-existe/children')
        .set('Authorization', auth())
        .send({ name: 'Mateo', age: 8 });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('GUARDIAN_NOT_FOUND');
    });

    it('nombre repetido para el mismo apoderado responde 409 CHILD_EXISTS', async () => {
      const guardian = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });
      await request(app.getHttpServer())
        .post(`/api/panel/guardians/${guardian.body.id}/children`)
        .set('Authorization', auth())
        .send({ name: 'Mateo', age: 8 });

      const res = await request(app.getHttpServer())
        .post(`/api/panel/guardians/${guardian.body.id}/children`)
        .set('Authorization', auth())
        .send({ name: '  mateo  ', age: 9 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CHILD_EXISTS');
    });
  });

  describe('GET /api/panel/guardians/:id', () => {
    it('devuelve la ficha con niños y sesiones', async () => {
      const guardian = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });
      await request(app.getHttpServer())
        .post(`/api/panel/guardians/${guardian.body.id}/children`)
        .set('Authorization', auth())
        .send({ name: 'Mateo', age: 8 });

      const res = await request(app.getHttpServer())
        .get(`/api/panel/guardians/${guardian.body.id}`)
        .set('Authorization', auth());
      expect(res.status).toBe(200);
      expect(res.body.guardian.email).toBe('camila@correo.cl');
      expect(res.body.children).toHaveLength(1);
      expect(res.body.sessions).toEqual([]);
    });
  });

  describe('GET /api/panel/guardians', () => {
    it('lista con conteo de niños', async () => {
      const guardian = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });
      await request(app.getHttpServer())
        .post(`/api/panel/guardians/${guardian.body.id}/children`)
        .set('Authorization', auth())
        .send({ name: 'Mateo', age: 8 });

      const res = await request(app.getHttpServer())
        .get('/api/panel/guardians')
        .set('Authorization', auth());
      expect(res.status).toBe(200);
      expect(res.body.guardians).toHaveLength(1);
      expect(res.body.guardians[0].childrenCount).toBe(1);
    });
  });

  describe('PATCH /api/panel/children/:id', () => {
    it('actualiza nombre y edad', async () => {
      const guardian = await request(app.getHttpServer())
        .post('/api/panel/guardians')
        .set('Authorization', auth())
        .send({ name: 'Camila', email: 'camila@correo.cl', phone: '+56911111111' });
      const child = await request(app.getHttpServer())
        .post(`/api/panel/guardians/${guardian.body.id}/children`)
        .set('Authorization', auth())
        .send({ name: 'Mateo', age: 8 });

      const res = await request(app.getHttpServer())
        .patch(`/api/panel/children/${child.body.id}`)
        .set('Authorization', auth())
        .send({ age: 9 });
      expect(res.status).toBe(200);
      expect(res.body.age).toBe(9);
      expect(res.body.name).toBe('Mateo');
    });
  });
});
