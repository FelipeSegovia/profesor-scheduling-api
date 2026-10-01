import { mkdirSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module.js';

/**
 * Vuelca el esquema OpenAPI real (el mismo que sirve `GET /api/docs-json` en
 * `src/main.ts`) a `docs/openapi.json`, versionado en el repo. Es la fuente
 * de la verdad del contrato HTTP para los frontends y para cualquier lectura
 * futura del repo: no hace falta levantar el servidor para consultarla.
 *
 * Vive bajo `src/` (no en un `scripts/` suelto en la raíz) para que `nest
 * build` lo compile con `tsc` real: `tsx`/esbuild no emiten los metadatos de
 * decoradores que Nest necesita para inyectar dependencias por tipo (rompe la
 * inyección de `ConfigService` en `PrismaService`), así que este archivo
 * **no** se corre con `tsx` — se compila con el resto de la app y se ejecuta
 * ya compilado. Requiere Postgres arriba (`pnpm db:up`): instancia
 * `AppModule` completo, incluido `PrismaService`, igual que arrancar la app o
 * correr los e2e. No expone la app por HTTP.
 *
 * Uso: `pnpm docs:openapi`. Volver a correrlo después de cualquier spec que
 * cambie un endpoint.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  // Igual que src/main.ts: el prefijo global debe estar puesto antes de
  // generar el documento, o las rutas salen sin `/api` y no calzan con lo que
  // el servidor sirve de verdad.
  app.setGlobalPrefix('api');
  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('profesor-scheduling-api')
      .setDescription('Backend del agendamiento de la educadora diferencial.')
      .setVersion('0.0.1')
      .addBearerAuth()
      .build(),
  );

  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/openapi.json', `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  // eslint-disable-next-line no-console
  console.log('docs/openapi.json actualizado.');
}

await main();
