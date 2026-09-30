Estado: completada
Última tarea completada: 7 (verificación final)
Siguiente: ninguna. Próxima spec según el orden acordado en 001/plan.md: reserva pública completa.

Resumen:
- @nestjs/swagger@12.0.2 instalado en dependencies (no dev: main.ts lo importa siempre, el gating es en runtime).
- Plugin CLI de @nestjs/swagger registrado en nest-cli.json (infiere esquemas de tipos planos, sin class-validator).
- main.ts monta /api/docs (UI) y /api/docs-json (esquema) solo si NODE_ENV !== 'production'. Verificado con curl real en ambos casos: dev da 200 HTML, producción da 404 {error,code:'NOT_FOUND'} — la ruta no está montada, no solo oculta.
- HealthController decorado con @ApiTags/@ApiOperation/@ApiResponse — patrón a seguir en las specs siguientes.
- test/swagger.e2e-spec.ts: 3 tests nuevos (UI, esquema JSON con /api/health documentado, 404 en "producción").
- CLAUDE.md actualizado: nueva sección de Swagger en Arquitectura, estado de specs actualizado (001 completada, 002 en curso -> ahora completada).
- Todo verificado: pnpm build, pnpm lint, pnpm test (43/43), pnpm test:e2e (11/11), y arranque real con curl contra Postgres real en ambos NODE_ENV.
