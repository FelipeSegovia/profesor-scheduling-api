# Spec: Documentación Swagger/OpenAPI

## Objetivo

Montar documentación interactiva de la API (Swagger UI + esquema OpenAPI) y dejar establecido el patrón de decoradores que deben seguir los controladores de las specs siguientes (reserva pública, panel, auth), de modo que cada endpoint nuevo se documente desde que se escribe, no como tarea aparte después.

Contexto y decisiones de arquitectura: `~/.claude/plans/crea-un-plan-para-mighty-kazoo.md`. Estado previo: `../001-fundaciones-dominio/` (completada) — Postgres/Prisma, dominio, config, errores, un solo endpoint (`GET /api/health`).

## Requisitos funcionales

### 1. Dependencia

- `@nestjs/swagger@12.0.2`, fijada (no `^`), consistente con el versionado de Prisma en la spec 001. Compatible con `@nestjs/core`/`@nestjs/common@12.1.1` ya instalados (peer deps verificadas).
- No se agregan `class-validator` ni `class-transformer`: son peers opcionales de `@nestjs/swagger` y el proyecto no los usa en ningún lado (dominio en `src/domain/` + Zod).
- No se agrega `swagger-ui-express`: `@nestjs/swagger` trae `swagger-ui-dist` propio.

### 2. Plugin CLI de Swagger

Registrar el plugin en `nest-cli.json` (`compilerOptions.plugins: ["@nestjs/swagger"]`) para que el esquema OpenAPI se infiera por análisis estático de los tipos TypeScript planos ya existentes (interfaces, tipos inline, tipos inferidos de Zod), sin necesidad de decorar cada campo con `@ApiProperty` ni convertir nada a clases. Mantiene el estilo del proyecto.

Se verifica durante la implementación que el plugin corra igual bajo `nest build` (usado por `pnpm build`/`pnpm start:prod`) y `nest start --watch` (usado por `pnpm start:dev`), y que no choque con la resolución `nodenext`/imports `.js` del resto del código.

### 3. Montaje en `main.ts`

- `DocumentBuilder` con título, descripción breve y versión (de `package.json`).
- `SwaggerModule.setup('api/docs', app, document)`, montado **después** de `app.setGlobalPrefix('api')`.
- Envuelto en `if (config.get('NODE_ENV', { infer: true }) !== 'production')`: en producción, `GET /api/docs` no debe estar montado en absoluto (no solo oculto) — una petición ahí debe pasar por el mismo `AllExceptionsFilter` que cualquier ruta inexistente, con el formato `{ error, code: 'NOT_FOUND' }`, igual que hoy pasa con `GET /api/health` sin prefijo (ver `001`, hallazgo de `setGlobalPrefix`).

### 4. Documentar el endpoint existente

`src/health/health.controller.ts` es el primer caso de uso real del patrón, y el ejemplo que deben copiar las specs siguientes:

- `@ApiTags('health')` en la clase.
- `@ApiOperation({ summary: ... })` en `check()`.
- `@ApiResponse` para 200 (`{ status: 'ok' }`) y 503 (cuerpo de error del filtro global).

### 5. Documentación del proyecto

- `CLAUDE.md` de esta app: mencionar `/api/docs` junto a `/api/health` donde hoy se describe el estado de los endpoints, y la regla de gating por `NODE_ENV`.
- `README.md`: una línea en el quickstart indicando que tras `pnpm start:dev` la documentación vive en `/api/docs`.

## Fuera de alcance

- Documentar endpoints de negocio que no existen todavía (llegan con sus propias specs).
- Autenticación sobre `/api/docs` (basic auth, IP allowlist, etc.). Si en el futuro se expone en producción, es una spec aparte.
- Generar un cliente TypeScript u otro artefacto a partir del esquema OpenAPI.
- Cambiar `removeComments` de `tsconfig.json` ni activar `introspectComments` del plugin (extraería JSDoc a la doc; no se activa acá).

## Criterios de aceptación

- [x] Con `NODE_ENV=development`, `GET /api/docs` sirve la UI de Swagger (200, `content-type` HTML) y el JSON del esquema está disponible (`GET /api/docs-json` o el path que exponga `SwaggerModule` por defecto).
- [x] Con `NODE_ENV=production`, `GET /api/docs` devuelve 404 en el formato `{ error, code: 'NOT_FOUND' }` del filtro global — no la UI, no el HTML por defecto de Express.
- [x] El esquema generado incluye `GET /api/health` con su tag, resumen y las dos respuestas (200 y 503) documentadas.
- [x] Un test e2e (`test/swagger.e2e-spec.ts`) cubre ambos casos de NODE_ENV, siguiendo el patrón de `test/health.e2e-spec.ts`.
- [x] `pnpm lint` y `pnpm build` pasan. `GET /api/health` sigue respondiendo exactamente igual que antes de esta spec (200 `{status:'ok'}`, 503 si la BD no responde).
- [x] `pnpm test` (unitarios) sigue en verde: esta spec no toca `src/domain/`.
