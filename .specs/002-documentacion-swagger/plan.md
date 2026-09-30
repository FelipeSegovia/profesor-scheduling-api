# Plan: Documentación Swagger/OpenAPI

## Dependencia

`@nestjs/swagger@12.0.2`, fijada. Verificado contra el registro npm: `peerDependencies` pide `@nestjs/core@^12.0.0` y `@nestjs/common@^12.0.0` — compatible con `12.1.1` instalado. `class-validator`/`class-transformer` son peers **opcionales** (no se instalan). Trae `swagger-ui-dist` propio (no se instala `swagger-ui-express`).

## Cambios de archivo

### `nest-cli.json`

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": ["@nestjs/swagger"]
  }
}
```

### `src/main.ts`

Después de `app.setGlobalPrefix('api')` y antes de `app.listen(...)`:

```ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// ...
if (config.get('NODE_ENV', { infer: true }) !== 'production') {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('profesor-scheduling-api')
      .setDescription('Backend del agendamiento de la educadora diferencial.')
      .setVersion('0.0.1')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}
```

### `src/health/health.controller.ts`

Agregar `@ApiTags('health')` en la clase y `@ApiOperation`/`@ApiResponse` (200, 503) en `check()`.

### Documentación

- `README.md`: ya tiene la sección de Swagger UI (agregada antes); no requiere cambios adicionales más allá de que ahora sea real.
- `CLAUDE.md`: agregar `/api/docs` a la lista de endpoints existentes y la regla de gating por `NODE_ENV`.

## Verificación

1. `pnpm add -D @nestjs/swagger@12.0.2` (devDependency: solo se usa para generar/servir la doc, no es parte del runtime de negocio — igual criterio que otras herramientas de desarrollo del proyecto).

   Nota: se evalúa en la implementación si debe ir en `dependencies` en vez de `devDependencies`, porque `SwaggerModule.setup()` se ejecuta en runtime de producción (aunque gateado por `NODE_ENV`) — el código de `main.ts` que lo importa debe poder resolverlo en `pnpm start:prod`, así que en realidad **debe ir en `dependencies`**, no en `devDependencies`. Corregido: `pnpm add @nestjs/swagger@12.0.2`.

2. `pnpm build` — confirma que el plugin de `nest-cli` no rompe la compilación con `nodenext`/imports `.js`.
3. `pnpm start:dev` con `NODE_ENV=development` (default de `.env`) → `curl localhost:3000/api/docs` debe dar 200 HTML.
4. Arrancar con `NODE_ENV=production` → `curl localhost:3000/api/docs` debe dar 404 `{error, code:'NOT_FOUND'}`.
5. `curl localhost:3000/api/health` sigue dando 200 `{status:'ok'}` sin cambios de comportamiento.
6. `pnpm lint`, `pnpm test`, `pnpm test:e2e` en verde.
7. Nuevo test `test/swagger.e2e-spec.ts` cubriendo los dos casos de NODE_ENV.
