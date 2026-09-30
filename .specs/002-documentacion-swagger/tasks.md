# Tasks: Documentación Swagger/OpenAPI

1. [x] **Instalar `@nestjs/swagger@12.0.2`** en `dependencies` (no dev: `main.ts` lo importa siempre, aunque el montaje esté gateado por `NODE_ENV`).
2. [x] **Registrar el plugin en `nest-cli.json`** (`compilerOptions.plugins: ["@nestjs/swagger"]`). Verificar que `pnpm build` sigue compilando limpio.
3. [x] **Montar Swagger en `main.ts`**: `DocumentBuilder` + `SwaggerModule.setup('api/docs', ...)`, gateado por `NODE_ENV !== 'production'`, después de `setGlobalPrefix`.
4. [x] **Decorar `HealthController`**: `@ApiTags`, `@ApiOperation`, `@ApiResponse` (200/503).
5. [x] **`test/swagger.e2e-spec.ts`**: NODE_ENV=development → docs sirve HTML 200; NODE_ENV=production → 404 `{error,code}`.
6. [x] **Documentación**: `CLAUDE.md` (endpoints + regla de gating).
7. [x] **Verificación final**: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, y una prueba manual real con `pnpm start:dev` + `curl`.
