# Tasks: Avisos en tiempo real al panel de la educadora

Orden de ejecución de [`plan.md`](./plan.md). Cada tarea deja el repo en verde (`pnpm lint && pnpm build`). Actualizar [`status.md`](./status.md) al cerrar cada tarea.

## Esquema

1. [x] **Migración**: `Educator.notificationsSeenAt DateTime?` (`add_educator_notifications_seen_at`). Aplicar en dev y test.

## Dominio puro

2. [x] **`src/events/session-events.types.ts` + `session-events.ts`**: `SessionEventKind`, `SessionEvent`, helper `sessionEvent(...)`. Test unitario de forma e `id`.
3. [x] **`src/domain/notifications.ts`**: `deriveNotifications(activity, seenAt)`. Tests: filtra `EDUCATOR`, `seenAt` null, borde `at === seenAt`, conteo.

## Bus de eventos

4. [x] **`src/events/session-events.service.ts` + `events.module.ts`** (`@Global()`), importado en `app.module.ts`. `complete()` en `onModuleDestroy`.
5. [x] **Emitir desde `BookingsService`** (`createBooking`, `confirmByToken`, `cancelByToken`) después del commit, con un `now` único para `statusChangedAt` y `at`. E2e en `test/panel-events.e2e-spec.ts` vía suscripción directa: `CREATED`/`CONFIRMED`/`CANCELLED` con actor `GUARDIAN`; idempotentes y `SLOT_TAKEN` no emiten. `test/bookings.e2e-spec.ts` y `test/sessions.e2e-spec.ts` pasan sin modificarse.
6. [x] **Emitir desde `PanelSessionsService`** (`createSession`, `createSeries`, `move`, `confirm`, `cancel`) con actor `EDUCATOR`. Ampliar el e2e de la tarea 5. E2e existentes del panel pasan sin modificarse.

## Stream SSE

7. [x] **`src/panel/events/panel-events.controller.ts`**: `@Sse`, guard, ping cada 25 s, Swagger. Agregar a `PANEL_CONTROLLERS`. E2e HTTP real (`app.listen(0)` + `fetch` + `AbortController`): llega `event: session` tras una reserva; 401 `NO_SESSION` sin token y con token de apoderado.

## Notificaciones

8. [x] **Extraer `src/panel/activity.query.ts`** (`loadRecentActivity`) de `PanelDashboardService.getSummary`. `test/panel-dashboard.e2e-spec.ts` pasa sin modificarse.
9. [x] **`src/panel/notifications/`**: `GET /panel/notifications`, `POST /panel/notifications/seen` (204), Swagger, agregado a `PANEL_CONTROLLERS`. E2e `test/panel-notifications.e2e-spec.ts`: reserva pública sube `unreadCount`, cita del panel no, `seen` lo resetea, 401 sin token.

## Documentación y cierre

10. [x] **`docs/API.md`** (stream + notificaciones) y `pnpm docs:openapi`. `test/swagger-coverage.e2e-spec.ts` en verde.
11. [x] **Reglas de negocio**: `../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md` (sección "Avisos en el panel"), `../AGENTS_PRIVATE.md`, `../CLAUDE.md`.
12. [x] **`CLAUDE.md` de la app** (endpoints, `EventsModule`, bus en memoria, 005 en el flujo SDD) y nota en `.specs/004-panel-educadora/status.md` sobre `NOT_CONFIRMED`/`SYSTEM` para el job.
13. [x] **Cierre**: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build` en verde; verificación manual con `curl -N` del `plan.md`. Marcar criterios de aceptación de `spec.md`.

## Adenda (spec del panel `005-avisos-tiempo-real`)

14. [x] **`startsAt` en `ActivityItem`** (pedido por la interfaz del panel, que lo necesita para mostrar el cupo de cada aviso y navegar a la semana de la cita; decisión aprobada el 2026-10-01).
    - `src/domain/activity.ts`: `SessionForActivity.startsAt: Date` y `ActivityItem.startsAt: string` (ISO), copiado a los dos eventos que aporta cada sesión (alta y cambio de estado). El `id` de los ítems no cambia.
    - `src/panel/activity.query.ts`: pasar `s.startsAt` al mapeo.
    - Tests: `src/domain/activity.spec.ts` y `src/domain/notifications.spec.ts` (los helpers de ítem ganan `startsAt`); e2e de `panel-notifications` y `panel-dashboard` verifican que `startsAt` viaja. Los e2e existentes del resumen deben pasar sin quitar ninguna aserción.
    - `docs/API.md` (ejemplo y descripción) y `pnpm docs:openapi`. Es un campo nuevo, no un cambio incompatible: también aparece en `activity` de `GET /api/panel/summary`.
    - `CLAUDE.md` de la app no cambia (no hay endpoint nuevo).

