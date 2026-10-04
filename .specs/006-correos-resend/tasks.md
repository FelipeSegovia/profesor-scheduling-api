# Tasks: Envío de correos con Resend

Orden de ejecución de [`plan.md`](./plan.md). Cada tarea deja el repo en verde (`pnpm lint && pnpm build`). Actualizar [`status.md`](./status.md) al cerrar cada tarea.

## Base técnica

1. [x] **Spike de React Email + ESM + `nest build`.** Instalar dependencias (`resend`, `@react-email/components`, `@react-email/render`, `react`, `react-dom`, `@nestjs/schedule`, `@types/react`, `@types/react-dom`). Agregar `"jsx": "react-jsx"` en `tsconfig.json` y `**/*.spec.tsx` en `vitest.config.ts`. Con una plantilla mínima y un `render-email.spec.tsx` que la renderice, deben pasar `pnpm test`, `pnpm lint` (cubre `.tsx`) y `pnpm build`. Además, `node dist/main` tiene que arrancar importando la plantilla. Si algo falla, **parar y consultar** antes de cambiar de enfoque.
2. [x] **Configuración.**
   - `src/config/env.ts`: `optionalString` (vacía = no configurada), `EMAIL_REPLY_TO`, `EMAIL_REDIRECT_TO` como email, `OUTBOX_POLL_INTERVAL_MS` y `superRefine` con las reglas de producción y de `EMAIL_FROM`.
   - `src/config/env.spec.ts` con esos casos.
   - `.env.test.example`: completar `EDUCATOR_JWT_*`. `.env.example` ya está listo.

## Contenido (puro, sin Nest ni BD)

3. [x] **Helpers.** `src/email/format.ts` (`formatSessionDateTime`), `email-links.ts` y `redirect.ts`, con sus tests unitarios: español, `America/Santiago` con un cambio de horario incluido, base con y sin `/` final, y redirect con y sin dirección.
4. [x] **Plantillas y `renderEmail`.**
   - `templates/layout.tsx` más una plantilla por kind: `BOOKING_PENDING`, `BOOKING_CONFIRMED`, `CONFIRMED`, `CANCELLED`, `RESCHEDULED`, `GUARDIAN_CONFIRMED`, `GUARDIAN_CANCELLED`, `SYSTEM_CONFIRMED` y `PASSWORD_RESET`.
   - Unión `EmailMessage` y `render-email.tsx` con un `switch` exhaustivo.
   - `render-email.spec.tsx`: asunto, enlaces en el HTML, niño y fecha en el texto, y ningún dato ajeno en los correos al apoderado.

## Transporte

5. [x] **`src/email/`.** `email-sender.ts` (interfaz y `EMAIL_SENDER`), `resend-email.sender.ts`, `console-email.sender.ts` y `email.module.ts` (`@Global()`, factory según `RESEND_API_KEY`), importado en `app.module.ts`. Sin `RESEND_API_KEY` la app arranca con el sender de consola, y los e2e existentes pasan sin cambios.

## Outbox

6. [x] **Migración `outbox_dispatch`.** `nextAttemptAt`, `providerId` e índice `(status, nextAttemptAt)`, con el comentario del modelo actualizado. Aplicar en dev y después correr `pnpm prisma generate`. La base de test la migra `global-setup`.
7. [x] **`OutboxModule`.** Mover `OutboxService` a `src/outbox/outbox.module.ts` y que `BookingsModule` y `PanelModule` lo importen en vez de proveerlo. Agregar `OutboxStatus` y `OutboxKind.SYSTEM_CONFIRMED`. Todos los e2e pasan sin modificarse.
8. [x] **Lógica pura del despachador.** `src/outbox/retry.ts` (`nextAttempt`: 1/5/15/60 min y `FAILED` al 5º intento) y `outbox-message.ts` (`buildMessage`: datos por kind, `skip` si la cita al apoderado ya pasó, `confirmUrl` de `RESCHEDULED` solo si está `PENDING`, `unknown kind`). Ambos con tests unitarios.
9. [x] **`OutboxDispatcherService`.**
   - `dispatchOnce(now)`: lote de 20 en serie, cada fila con su propio `try/catch`, que termina en `SENT`, `PENDING` con backoff, `FAILED` o `SKIPPED`. Usa `idempotencyKey = row.id`.
   - Intervalo con `SchedulerRegistry` y flag `running`; no se registra con `NODE_ENV=test`. `ScheduleModule.forRoot()` va en `AppModule`.
   - Tests: `test/helpers/fake-email-sender.ts`, `createTestApp({ emailSender })` y `test/outbox-dispatch.e2e-spec.ts` con los casos de envío, fallo y backoff hasta `FAILED`, lote que sigue tras un fallo, `SKIPPED`, y confirmar por token (apoderado + educadora).

## Requisitos 5 y 7

10. [x] **`SYSTEM_CONFIRMED`** en `BookingsService.createBooking`: con `findFirst` de la educadora, y sin fila si no hay educadora. Casos e2e en `outbox-dispatch.e2e-spec.ts`: la reserva pública que nace `CONFIRMED` deja las dos filas; la que nace `PENDING` y la cita del panel no dejan `SYSTEM_CONFIRMED`. `test/bookings.e2e-spec.ts` pasa sin modificarse.
11. [x] **Reset de clave.** `AuthService.forgot` envía `PASSWORD_RESET` sin esperar el envío (`void … .catch(log)`). E2e: con cuenta llega un envío con `/cuenta/restablecer/<devResetToken>` (vía `vi.waitFor`); sin cuenta, ningún envío; la respuesta no cambia. `test/auth.e2e-spec.ts` pasa sin modificarse.

## Documentación y cierre

12. [x] **Documentación.**
    - `CLAUDE.md` de la app: sección de correo, corregir el párrafo del job y agregar la 006 al flujo SDD.
    - `docs/API.md`: correos por endpoint.
    - `pnpm docs:openapi` debe dejar `docs/openapi.json` sin diff.
    - `../CLAUDE.md`: hoja de ruta.
    - Comentario de `OutboxService`.
13. [ ] **Cierre.**
    - `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` en verde.
    - Prueba manual con Resend en sandbox (`onboarding@resend.dev` + `EMAIL_REDIRECT_TO`) contra `dist/main` en un puerto libre, sin tocar 3000, 5173 ni 5174: reserva → correo con Confirmo / No puedo → enlaces abren el front; `forgot` → correo de reset. Requiere que el usuario ponga su `RESEND_API_KEY` en `.env`.
    - Borrar los datos de prueba de la base de desarrollo.
    - Marcar los criterios de aceptación de `spec.md`.
