import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/errors/exception.filter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { truncateAll } from './helpers/db.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Replica lo que hace src/main.ts: el arnés de test no pasa por bootstrap().
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health devuelve 200 cuando la base responde', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('una ruta inexistente devuelve { error, code } en JSON, no el HTML por defecto de Nest', async () => {
    const response = await request(app.getHttpServer()).get('/api/esto-no-existe');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: 'Cannot GET /api/esto-no-existe',
      code: 'NOT_FOUND',
    });
  });
});
