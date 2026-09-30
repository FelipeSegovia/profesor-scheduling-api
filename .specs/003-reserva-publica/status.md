Estado: completada
Última tarea completada: 25 (pasada final de verificación y cierre)
Siguiente: ninguna. Próxima spec según el orden acordado (`CLAUDE.md`): vencimiento de confirmación con su job.

Resumen:
- Módulos nuevos: `src/slots/`, `src/bookings/` (incluye `sessions.controller.ts`), `src/auth/`, más `src/common/tokens/`, `src/common/prisma/`, `src/common/dto.ts` y `src/outbox/`.
- `@nestjs/jwt` agregado (sin Passport). JWT con payload `{ sub, tokenVersion }`; `GuardianContextMiddleware` decodifica un Bearer opcional sin lanzar nunca; `GuardianAuthGuard` exige sesión solo en `GET /auth/me`. Invalidar sesión = incrementar `Guardian.tokenVersion` (reset de clave).
- `argon2` para `Guardian.passwordHash`; SHA-256 simple para el hash del token de reset (`src/common/tokens/random-token.ts`).
- Carrera de doble reserva resuelta con el índice único parcial `session_active_slot` (spec 001): chequeo optimista + captura del `P2002` real (`src/common/prisma/prisma-errors.ts`), verificado con un test e2e de concurrencia real (`Promise.allSettled`).
- `OutboxEmail` se llena en reserva/confirmar/cancelar (una fila por evento real, cero en el camino idempotente); ningún proceso la despacha todavía.
- Zod deliberadamente permisivo: los mensajes/códigos del contrato los produce el dominio, no los esquemas.
- Todos los endpoints documentados en Swagger (`@ApiTags/@ApiOperation/@ApiResponse`), verificado con `test/swagger-coverage.e2e-spec.ts` (12 operaciones).
- 66 tests unitarios + 75 tests e2e (contra Postgres real), `pnpm lint` y `pnpm build` en verde.
- Hallazgo de infraestructura corregido en el camino: `vitest.config.e2e.ts` corría los archivos e2e en paralelo contra la misma base de test, produciendo deadlocks reales de Postgres al crecer la suite; se fijó `fileParallelism: false`.
- Verificado también a mano con `pnpm start:dev` contra Postgres real (`curl` a `/api/slots`, `/api/bookings`, `/api/sessions/confirm/:token`).
- Documentación actualizada: `CLAUDE.md` (tabla de endpoints, JWT, carrera de reserva, `fileParallelism`) y `README.md` (sección de `curl` del flujo completo).
- Los 28 criterios de aceptación de `spec.md` están marcados.
