import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { AllExceptionsFilter } from '../../src/common/errors/exception.filter.js';
import { EMAIL_SENDER, type EmailSender } from '../../src/email/email-sender.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/**
 * Bootstrap idéntico al de `src/main.ts`, salvo Swagger (ver `swagger.e2e-spec.ts`).
 * `emailSender` reemplaza el transporte de correo (spec 006); sin él, en test
 * se usa el de consola porque `.env.test` no tiene `RESEND_API_KEY`.
 */
export async function createTestApp(options: { emailSender?: EmailSender } = {}): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.emailSender) {
    builder = builder.overrideProvider(EMAIL_SENDER).useValue(options.emailSender);
  }
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma: moduleFixture.get(PrismaService) };
}
