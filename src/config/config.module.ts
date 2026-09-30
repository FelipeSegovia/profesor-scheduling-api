import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.js';

/**
 * Envuelve `@nestjs/config` global con validación Zod. Se importa una sola vez
 * en `AppModule`; cualquier módulo puede inyectar `ConfigService<Env, true>`
 * (el segundo genérico marca las variables como siempre presentes, ya que
 * `validateEnv` garantiza eso o el proceso no arranca).
 *
 * `NODE_ENV=test` carga `.env.test` en vez de `.env` (lo fija `pnpm test:e2e`
 * en el script, antes de que arranque Node). Apunta a una base separada, para
 * que truncar tablas entre casos de e2e nunca toque datos de desarrollo.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
