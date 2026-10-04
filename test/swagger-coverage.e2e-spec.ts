import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/errors/exception.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { truncateAll } from './helpers/db.js';

/**
 * Cobertura de Swagger para los endpoints de `003-reserva-publica` y
 * `004-panel-educadora`: cada ruta nueva debe aparecer en `/api/docs-json`
 * con al menos un tag y un summary. Ver `.specs/003-reserva-publica/tasks.md`,
 * tarea 22, y `.specs/004-panel-educadora/tasks.md`, tarea 32.
 */
describe('Swagger coverage — reserva pública y panel de la educadora (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let schema: { paths: Record<string, Record<string, { tags?: string[]; summary?: string }>> };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('profesor-scheduling-api').setVersion('0.0.1').build(),
    );
    SwaggerModule.setup('api/docs', app, document);

    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await truncateAll(prisma);

    const res = await request(app.getHttpServer()).get('/api/docs-json');
    schema = res.body;
  });

  afterAll(async () => {
    await app.close();
  });

  const expectedOperations: Array<{ path: string; method: string; tag: string }> = [
    { path: '/api/slots', method: 'get', tag: 'slots' },
    { path: '/api/bookings', method: 'post', tag: 'bookings' },
    { path: '/api/bookings/{id}', method: 'get', tag: 'bookings' },
    { path: '/api/sessions/confirm/{token}', method: 'post', tag: 'sessions' },
    { path: '/api/sessions/cancel/{token}', method: 'post', tag: 'sessions' },
    { path: '/api/auth/register', method: 'post', tag: 'auth' },
    { path: '/api/auth/login', method: 'post', tag: 'auth' },
    { path: '/api/auth/logout', method: 'post', tag: 'auth' },
    { path: '/api/auth/me', method: 'get', tag: 'auth' },
    { path: '/api/auth/email-status', method: 'get', tag: 'auth' },
    { path: '/api/auth/forgot', method: 'post', tag: 'auth' },
    { path: '/api/auth/reset', method: 'post', tag: 'auth' },

    // 004-panel-educadora
    { path: '/api/panel/auth/login', method: 'post', tag: 'panel-auth' },
    { path: '/api/panel/auth/logout', method: 'post', tag: 'panel-auth' },
    { path: '/api/panel/auth/me', method: 'get', tag: 'panel-auth' },
    { path: '/api/panel/auth/password', method: 'post', tag: 'panel-auth' },
    { path: '/api/panel/agenda', method: 'get', tag: 'panel-agenda' },
    { path: '/api/panel/summary', method: 'get', tag: 'panel-summary' },
    { path: '/api/panel/preferences', method: 'get', tag: 'panel-schedule' },
    { path: '/api/panel/preferences', method: 'put', tag: 'panel-schedule' },
    { path: '/api/panel/template', method: 'put', tag: 'panel-schedule' },
    { path: '/api/panel/blocks/day', method: 'post', tag: 'panel-schedule' },
    { path: '/api/panel/blocks/day/{date}', method: 'delete', tag: 'panel-schedule' },
    { path: '/api/panel/blocks/slot', method: 'post', tag: 'panel-schedule' },
    { path: '/api/panel/blocks/slot/{date}/{time}', method: 'delete', tag: 'panel-schedule' },
    { path: '/api/panel/sessions', method: 'post', tag: 'panel-sessions' },
    { path: '/api/panel/series', method: 'post', tag: 'panel-sessions' },
    { path: '/api/panel/sessions/{id}/move', method: 'patch', tag: 'panel-sessions' },
    { path: '/api/panel/sessions/{id}/confirm', method: 'post', tag: 'panel-sessions' },
    { path: '/api/panel/sessions/{id}/cancel', method: 'post', tag: 'panel-sessions' },
    { path: '/api/panel/guardians', method: 'get', tag: 'panel-people' },
    { path: '/api/panel/guardians/{id}', method: 'get', tag: 'panel-people' },
    { path: '/api/panel/guardians', method: 'post', tag: 'panel-people' },
    { path: '/api/panel/guardians/{id}', method: 'patch', tag: 'panel-people' },
    { path: '/api/panel/guardians/{id}/children', method: 'post', tag: 'panel-people' },
    { path: '/api/panel/children/{id}', method: 'patch', tag: 'panel-people' },
    { path: '/api/panel/children/{id}/notes', method: 'get', tag: 'panel-clinical-notes' },
    { path: '/api/panel/children/{id}/notes', method: 'post', tag: 'panel-clinical-notes' },
    { path: '/api/panel/children/{id}/notes.pdf', method: 'get', tag: 'panel-clinical-notes' },
    { path: '/api/panel/notes/{id}', method: 'patch', tag: 'panel-clinical-notes' },
    { path: '/api/panel/notes/{id}', method: 'delete', tag: 'panel-clinical-notes' },
  ];

  it.each(expectedOperations)(
    '$method $path está documentada con tag "$tag" y summary',
    ({ path, method, tag }) => {
      const operation = schema.paths[path]?.[method];
      expect(operation, `falta ${method.toUpperCase()} ${path} en el esquema`).toBeDefined();
      expect(operation.tags).toContain(tag);
      expect(operation.summary).toBeTruthy();
    },
  );
});
