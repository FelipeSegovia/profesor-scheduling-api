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
 * Cobertura de Swagger para los endpoints de `003-reserva-publica`: cada ruta
 * nueva debe aparecer en `/api/docs-json` con al menos un tag y un summary.
 * Ver `.specs/003-reserva-publica/tasks.md`, tarea 22.
 */
describe('Swagger coverage — reserva pública (e2e)', () => {
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
