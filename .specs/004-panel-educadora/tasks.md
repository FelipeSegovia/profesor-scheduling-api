# Tasks: Panel de la educadora

Orden de ejecución de [`plan.md`](./plan.md). Cada tarea deja el repo en verde (`pnpm lint && pnpm build`). Actualizar [`status.md`](./status.md) al cerrar cada tarea.

## Esquema

1. [x] **Migración**: `Session.statusChangedBy Actor?`, `Session.statusChangedAt DateTime?`. `pnpm prisma migrate dev`.
2. [x] **`src/config/env.ts`**: `EDUCATOR_JWT_SECRET` (`z.string().min(32)`), documentar en `.env.example`.

## Cupos (refactor, sin cambiar el contrato público)

3. [x] **`src/slots/slot-grid.ts`**: `SlotState`, `SlotCell`, `resolveSlotState()`. Test unitario con las 5 combinaciones de precedencia.
4. [x] **`src/slots/slots.service.ts` — `buildWeekGrid(mondayYmd)`**: candidatos de plantilla (7 días) + sesiones activas fuera de plantilla, resolución de `state`, `session` embebido solo en `BOOKED`.
5. [x] **Reescribir `buildWeekSlots` como proyección de `buildWeekGrid`.** `test/slots.e2e-spec.ts` debe pasar sin modificarse.

## Dominio puro

6. [x] **`src/domain/schedule.ts`**: `expandRangeToHours`, `collapseHoursToRange`, `isContiguousHourRange`, `templateRowsFromWorkWeek`, `workWeekFromTemplateRows`. Tests.
7. [x] **`src/domain/series.ts`**: `expandSeriesDates`. Test cruzando cambio de horario de Chile (dos TZ, como `time.spec.ts`).
8. [x] **`src/domain/preferences.ts`**: `validatePreferences`. Tests de límites.
9. [x] **`src/domain/activity.ts`**: `deriveActivity`. Tests.
10. [x] **Ampliar `src/domain/booking.ts`**: `canMoveSession`, `canMarkConfirmed`. Tests.
11. [x] **Ampliar `src/domain/time.ts`**: `todayChileYmd`, `chileDayRange`, `weekSundayYmd`, `weekDaysMonSunYmd`. Tests.

## Autenticación de la educadora

12. [x] **`src/common/errors/panel-messages.ts`**: `PanelErrorMessage`.
13. [x] **`src/panel/auth/educator-token.service.ts`**: `sign`/`verify` con `role:'educator'`, `JwtModule` propio con token de inyección separado. Test unitario.
14. [x] **`EducatorContextMiddleware`, `@CurrentEducator()`, `EducatorAuthGuard`** (aplicado con `@UseGuards` por controlador/ruta, no `APP_GUARD` — ver nota en `status.md`). Tests unitarios del guard.
15. [x] **`panel-auth.service.ts` — `login`, `me`, `logout`, `password`.** Tests e2e: credenciales malas, cambio de clave invalida token viejo.
16. [x] **`panel-auth.controller.ts` + `panel.module.ts`.** `@ApiTags('panel-auth')`. Test e2e: token de apoderado rechazado en `/panel/*`; token de educadora rechazado en `/api/auth/me`.

## Lecturas

17. [x] **`panel-agenda.service.ts`/`panel-agenda.controller.ts` — `GET /panel/agenda`.** Test e2e: 5 estados, sesión fuera de plantilla visible.
18. [x] **`panel-schedule.service.ts` — `GET /panel/preferences`** (lectura, sin las mutaciones aún). `@ApiTags('panel-schedule')`.
19. [x] **`panel-dashboard.service.ts`/`panel-dashboard.controller.ts` — `GET /panel/summary`.** Test e2e verificando las 4 métricas con datos sembrados a mano.

## Mutaciones de sesión

20. [x] **`src/outbox/outbox.service.ts`**: `OutboxKind += RESCHEDULED, GUARDIAN_CONFIRMED, GUARDIAN_CANCELLED`.
21. [x] **`panel-sessions.service.ts` — `createSession`.** Test e2e: cupo ocupado/bloqueado/fuera de plantilla (aceptado).
22. [x] **`panel-sessions.service.ts` — `move`.** Test e2e: libera cupo anterior (verificado contra `GET /api/slots`), plazo vencido → `CONFIRMED`.
23. [x] **`panel-sessions.service.ts` — `confirm`, `cancel`.** Test e2e: transición inválida, idempotencia donde aplique.
24. [x] **`panel-sessions.controller.ts`.** `@ApiTags('panel-sessions')`.

## Series

25. [x] **`panel-sessions.service.ts` — `createSeries`.** Test e2e: salta ocupados/bloqueados/pasados y los reporta; sin fechas válidas → 400 `SERIES_EMPTY`.

## Horario y preferencias

26. [x] **`panel-schedule.service.ts` — bloqueos día/cupo.** Test e2e: cupo ocupado → 409 `SLOT_NOT_EMPTY`; desbloquear inexistente → 204.
27. [x] **`panel-schedule.service.ts` — `replaceTemplate`.** Test e2e: sesiones existentes intactas tras editar plantilla; `orphanSessions` correcto.
28. [x] **`panel-schedule.service.ts` — `updatePreferences`.** Test e2e: `seriesNoticeHours <= confirmationDeadlineHours` → 400, fila sin cambios.

## Fichas

29. [x] **`panel-people.service.ts`/`panel-people.controller.ts` — guardians y children.** Test e2e: email duplicado → 409, edad fuera de 3–13 aceptada.

## Aviso pendiente al apoderado → educadora

30. [x] **`bookings.service.ts` — `confirmByToken`/`cancelByToken`: outbox a la educadora + `statusChangedBy`/`statusChangedAt`.** Test e2e: fila `OutboxEmail` extra con `GUARDIAN_CONFIRMED`/`GUARDIAN_CANCELLED`; las mutaciones del panel no generan esa fila.

## Cierre

31. [x] **`src/main.ts` — `DocumentBuilder.addBearerAuth()`.** (También replicado en `src/scripts/export-openapi.ts`, que duplica la misma config.)
32. [x] **Verificación de Swagger para todos los endpoints nuevos.** Ampliado `expectedOperations` de `test/swagger-coverage.e2e-spec.ts` con las 24 rutas del panel (36 tests en total).
33. [x] **Suite completa + verificación manual.** `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build` en verde; `curl` contra Postgres real (login, summary, preferences, agenda, 401 sin token y con token de otra superficie). No se repitió la simulación de clon limpio completa de la spec 001 (`rm -rf node_modules`, etc.) por ser una operación destructiva no solicitada; la cobertura automatizada + manual da confianza equivalente para una spec que no toca infraestructura.
34. [x] **`pnpm docs:openapi`** y actualizar `docs/API.md` (tabla de endpoints, sección de autenticación de la educadora).
35. [x] **Documentación.** `CLAUDE.md` de esta app (tabla de endpoints, orden de specs, JWT de la educadora, bug del driver adapter) y raíz (roadmap).
36. [x] **Pasada final de verificación y cierre.** Marcar criterios de aceptación de `spec.md`, `status.md` a `completada`.
