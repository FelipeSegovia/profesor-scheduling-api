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
 * Replica las dos ramas de `src/main.ts` (montar Swagger o no, según
 * `NODE_ENV !== 'production'`) directamente, en vez de depender de la
 * variable de entorno real: el harness de e2e siempre corre con
 * `NODE_ENV=test` (ver `config.module.ts`), así que no puede alternar entre
 * "producción" y "no producción" cambiando esa variable en un mismo proceso.
 */
describe('Swagger (e2e)', () => {
  describe('fuera de producción: Swagger está montado', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

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
    });

    beforeEach(async () => {
      await truncateAll(prisma);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/docs sirve la UI de Swagger', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('GET /api/docs-json sirve el esquema OpenAPI e incluye /api/health documentado', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs-json');
      expect(response.status).toBe(200);
      const healthPath = response.body.paths['/api/health'];
      expect(healthPath).toBeDefined();
      expect(healthPath.get.tags).toContain('health');
      expect(healthPath.get.responses).toHaveProperty('200');
      expect(healthPath.get.responses).toHaveProperty('503');
    });
  });

  describe('en producción: Swagger no está montado', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalFilters(new AllExceptionsFilter());
      // A propósito: no se llama a SwaggerModule.setup(), igual que main.ts
      // cuando NODE_ENV === 'production'.
      await app.init();
      prisma = moduleFixture.get(PrismaService);
    });

    beforeEach(async () => {
      await truncateAll(prisma);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/docs devuelve 404 { error, code } en vez de la UI', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs');
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({
        error: 'Cannot GET /api/docs',
        code: 'NOT_FOUND',
      });
    });
  });
});
