Estado: completada
Última tarea completada: 14 (adenda)
Siguiente: ninguna en esta app. La interfaz del panel sigue en
`private-profesor-scheduling/.specs/005-avisos-tiempo-real/` (plan aprobado). Después, la spec del
job de vencimiento (`PENDING` → `NOT_CONFIRMED`), que debe emitir el evento `NOT_CONFIRMED` con
actor `SYSTEM` (ver nota en `../004-panel-educadora/status.md`).
Notas:
- spec.md, plan.md y tasks.md aprobados por el usuario (2026-10-01).
- Decisiones: SSE con Bearer en header (no `EventSource`), notificaciones derivadas de `Session` sin tabla nueva. Plan general en `~/.claude/plans/crea-un-plan-para-kind-octopus.md`.
- Tarea 1: migración `20261001184832_add_educator_notifications_seen_at`; la base de test la aplica sola `global-setup`.
- Tareas 2-3: `src/events/{session-events.types,session-events}.ts` y `src/domain/notifications.ts`, con sus specs.
- Tareas 4-6: `EventsModule` global (`src/events/`); emisión después del commit en `BookingsService` (create/confirm/cancel; las ramas idempotentes y los errores no emiten) y en `PanelSessionsService` (create, series, move, confirm, cancel; actor `EDUCATOR`). El `at` del evento es el mismo `Date` guardado en `statusChangedAt`.
- Tarea 7: `src/panel/events/panel-events.controller.ts` (`@Sse`, `EducatorAuthGuard`, `PING_INTERVAL_MS = 25_000`), registrado en `PANEL_CONTROLLERS`.
- Tarea 8: `src/panel/activity.query.ts` (`loadRecentActivity`, `ACTIVITY_SESSION_WINDOW = 50`) extraído del dashboard; `panel-dashboard.e2e-spec.ts` pasa sin modificarse.
- Tarea 9: `src/panel/notifications/` (`NOTIFICATIONS_LIMIT = 20`); `unreadCount` se calcula sobre toda la ventana y solo la lista se recorta.
- Tareas 10-12: `docs/API.md` (+ `openapi.json`, 40 rutas), `docs/mvp/REQUERIMIENTOS_FUNCIONALES.md` ("Avisos en el panel"), `AGENTS_PRIVATE.md`, `../CLAUDE.md`, `CLAUDE.md` de la app y nota para el job en el status de la 004.
- Tarea 13: `pnpm test` 116 unitarios, `pnpm test:e2e` 189 e2e (17 archivos), `pnpm lint` y `pnpm build` en verde. Verificación manual con `curl -N` contra `dist/main` en el puerto 3010: el stream entregó `CREATED` y `CONFIRMED` (actor `GUARDIAN`), el confirm repetido no emitió, y `seen` dejó `unreadCount` en 0. Los datos de prueba se borraron de la base de desarrollo.
- Los e2e de reservas, sesiones, panel-sessions, panel-series y panel-dashboard pasan sin modificarse (contrato del apoderado y del resumen intactos).
- **Gotcha de Prisma 7**: `prisma migrate dev` NO regenera el cliente. Tras la migración hubo que correr `pnpm prisma generate` antes de usar `Educator.notificationsSeenAt` (el build falló con TS2339 hasta entonces). Anotado en `CLAUDE.md`.
- **Corrección durante el cierre**: el plan afirmaba que `SessionEvent.id` coincide con `ActivityItem.id`. Es falso para el alta (`…:CREATED` frente a `…:created`). No se tocó el `id` de `deriveActivity` (es respuesta de `GET /panel/summary`, spec 004); spec, plan, `API.md` y comentarios se corrigieron. Para cruzar evento e ítem, comparar `sessionId` y `kind`.
- **Adenda (2026-10-01)**: al planificar la interfaz del panel se vio que los ítems de la campana no traen `startsAt`, necesario para mostrar el cupo de cada aviso y navegar a la semana de la cita. Se aprobó agregarlo (tarea 14). Es un campo nuevo; no cambia ni quita nada del contrato.
- Tarea 14 (adenda) cerrada: `startsAt` (ISO, inicio de la cita) en `ActivityItem` (`src/domain/activity.ts`, `src/panel/activity.query.ts`), con tests unitarios y e2e (campana y resumen); `docs/API.md` y `openapi.json` actualizados. `pnpm test` 117, `pnpm test:e2e` 190, lint y build en verde. Ningún e2e existente perdió una aserción.
