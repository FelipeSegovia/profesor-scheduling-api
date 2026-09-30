import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { AllExceptionsFilter } from '../../src/common/errors/exception.filter.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/** Bootstrap idéntico al de `src/main.ts`, salvo Swagger (ver `swagger.e2e-spec.ts`). */
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma: moduleFixture.get(PrismaService) };
}
