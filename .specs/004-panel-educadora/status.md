Estado: completada
Última tarea completada: 36 (cierre)
Siguiente: ninguna. Próxima spec según el orden acordado (`../../CLAUDE.md`): vencimiento de
confirmación con su job (despacha `OutboxEmail`, `PENDING` → `NOT_CONFIRMED`).
Notas:
- spec.md y plan.md aprobados por el usuario.
- Orden de specs actualizado en `../../../CLAUDE.md` y en el `CLAUDE.md` de esta app.
- Migración `20260930174050_add_session_status_actor` aplicada (dev y test).
- `EDUCATOR_JWT_SECRET`/`EDUCATOR_JWT_EXPIRES_IN` agregadas a `env.ts`, `.env`, `.env.example`, `.env.test`.
- `buildWeekGrid` implementado en `src/slots/slots.service.ts`; `buildWeekSlots` reescrito
  como proyección suya. `test/slots.e2e-spec.ts` pasa sin modificarse (7/7).
- Dominio puro nuevo: `schedule.ts`, `series.ts`, `preferences.ts`, `activity.ts`,
  `slot-grid.ts`, más `canMoveSession`/`canMarkConfirmed` en `booking.ts` y
  `todayChileYmd`/`chileDayRange`/`weekSundayYmd`/`weekDaysMonSunYmd` en `time.ts`.
- **Hallazgo y arreglo fuera del alcance original de esta spec, pero bloqueante para
  cualquier baseline verde**: `isSlotTakenViolation` (`src/common/prisma/prisma-errors.ts`)
  no reconocía la forma real del error `P2002` que produce `@prisma/adapter-pg@7.10.0`
  (el nombre del índice viaja en `meta.driverAdapterError.cause.constraint.index`, no en
  `meta.target`). Esto hacía que el test de carrera de `bookings.e2e-spec.ts` (spec 003)
  fallara con 500 en vez de 409 — confirmado que ya fallaba en `master` antes de cualquier
  cambio de esta sesión (drift de entorno/dependencias, no una regresión de código). Se
  arregló aceptando ambas formas del error, con test unitario nuevo para la forma real.
- Suite completa en verde: 99 unitarios + 75 e2e + lint + build (antes de la Fase 1).
- **Fase 1 completa** (`src/panel/auth/`, `src/panel/panel.module.ts`): `EducatorTokenService`
  (JWT propio, `EDUCATOR_JWT_SECRET`, claim `role:'educator'`), `EducatorContextMiddleware`,
  `EducatorAuthGuard`, `@CurrentEducator()`, `PanelAuthService`/`PanelAuthController`
  (`POST /panel/auth/login`, `/logout`, `GET /me`, `POST /password`).
  - **Desviación deliberada del plan.md original**: el guard NO se registra como `APP_GUARD`.
    Ese token de Nest aplica el guard a TODA la aplicación (todas las rutas, incluidas las
    del apoderado), sin importar en qué módulo se declare — exactamente la fuga de
    privilegios que esta spec busca evitar. En su lugar, `EducatorAuthGuard` se aplica con
    `@UseGuards` por controlador/ruta, igual que `GuardianAuthGuard` en el módulo del
    apoderado (mismo patrón ya establecido en el repo).
  - Test e2e crítico confirmado: un token de apoderado responde 401 en `/api/panel/auth/me`
    y un token de educadora responde 401 en `/api/auth/me`.
- Suite completa en verde tras la Fase 1: 106 unitarios + 88 e2e + lint + build.
- **Fase 4 completa** (`src/panel/agenda/`, `src/panel/dashboard/`, `src/panel/schedule/`,
  `src/panel/panel.dto.ts`): `GET /panel/agenda` (7 días, `SlotCell[]` por día, `dayBlocked`
  agregado), `GET /panel/preferences` (deriva `workWeek` de `TemplateSlot`, sin mutación
  todavía), `GET /panel/summary` (4 métricas, `todaySessions`, `attention`, `activity`
  derivada con `deriveActivity`, `nextFreeSlot`). `PanelModule` ahora importa `SlotsModule`
  (`SlotsService` exportado) y aplica `EducatorContextMiddleware` a los 4 controladores del
  panel. `sessionToPanelDto` en `panel.dto.ts` es el mapeo compartido `Session`→forma del
  panel (status en inglés, no traducido — el contrato del panel no está congelado).
- Suite completa en verde tras la Fase 4: 106 unitarios + 102 e2e + lint + build.
- **Cambio transversal**: `DomainError.code` y `ErrorBody.code` (`exception.filter.ts`) se
  ampliaron de `ErrorCodeValue` (el enum cerrado del contrato del apoderado) a `string`, para
  poder lanzar los códigos nuevos del panel (`SESSION_NOT_FOUND`, `CHILD_NOT_FOUND`,
  `SLOT_BLOCKED`, `SERIES_EMPTY`, etc. en `panel-messages.ts`) sin tocar `ErrorCode` (que
  sigue documentando el contrato congelado real). No cambia el comportamiento de ningún
  endpoint existente.
- **Fases 5 y 6 completas** (`src/panel/sessions/`): `POST /panel/sessions` (cita única,
  acepta fuera de plantilla), `POST /panel/series` (filtra antes de escribir, reporta
  `skipped` con `reason`), `PATCH /panel/sessions/:id/move`, `POST /panel/sessions/:id/confirm`,
  `POST /panel/sessions/:id/cancel`. `OutboxKind` ganó `RESCHEDULED`,
  `GUARDIAN_CONFIRMED`, `GUARDIAN_CANCELLED` (estos dos últimos se usarán en la Fase 9).
  Helper nuevo `toChileTimeString` en `domain/time.ts` (reemplaza formateadores locales
  duplicados en `slots.service.ts` y `panel.dto.ts`).
- Suite completa en verde tras las Fases 5-6: 107 unitarios + 122 e2e + lint + build.
- **Fase 7 completa** (`src/panel/schedule/`): `PUT /panel/preferences`, `PUT /panel/template`
  (diff contra `TemplateSlot`, sesiones existentes intactas, `orphanSessions`),
  `POST`/`DELETE /panel/blocks/day(:date)`, `POST`/`DELETE /panel/blocks/slot(:date/:time)`.
  - **Bug encontrado y corregido durante la implementación, no en producción**: el primer
    borrador de `assertDayEmpty`/`assertSlotEmpty` y del cálculo de `orphanSessions` comparaba
    horas usando `getUTCHours()`/`getUTCDay()` sobre `Session.startsAt` en vez de la hora de
    calendario chilena (`toChileTimeString`/`weekdayOf(toChileDateString(...))`). Como Chile
    está en UTC-3/-4, eso habría bloqueado o desbloqueado el cupo equivocado fuera de la
    ventana de pruebas (los tests e2e igual pasaban por casualidad al no cruzar medianoche
    UTC). Corregido antes de cerrar la tarea, usando los mismos helpers de `domain/time.ts`
    que el resto del código.
- Suite completa en verde tras la Fase 7: 107 unitarios + 130 e2e + lint + build.
- **Fase 8 completa** (`src/panel/people/`): `GET /panel/guardians(?query=)`,
  `GET /panel/guardians/:id` (ficha con niños e histórico completo de sesiones),
  `POST /panel/guardians`, `PATCH /panel/guardians/:id`, `POST /panel/guardians/:id/children`
  (sin rango de edad 3–13, a diferencia del formulario público), `PATCH /panel/children/:id`.
  Código nuevo `CHILD_EXISTS` (nombre duplicado para el mismo apoderado, `@@unique` de
  `Child`) agregado a `panel-messages.ts`, no estaba en el diseño original del `plan.md`.
- Suite completa en verde tras la Fase 8: 107 unitarios + 138 e2e + lint + build. (Un timeout
  transitorio de 5s en un test de `panel-dashboard.e2e-spec.ts` al correr la suite completa
  por primera vez tras esta fase, por la carga acumulada de ~50s de e2e en serie —
  desapareció al repetir; no es un bug de lógica.)
- **Fase 9 completa**: `confirmByToken`/`cancelByToken` (`src/bookings/bookings.service.ts`)
  ahora escriben `statusChangedBy:'GUARDIAN'`/`statusChangedAt` y una fila `OutboxEmail`
  extra dirigida a `Educator.email` (`GUARDIAN_CONFIRMED`/`GUARDIAN_CANCELLED`), en la misma
  transacción.
  - **Hallazgo real al implementar**: `test/sessions.e2e-spec.ts` (spec 003) no sembraba
    ninguna `Educator`; como el código nuevo hace `tx.educator.findFirstOrThrow()` dentro de
    la transacción, esos tests habrían empezado a fallar con 500 en vez de 200/409. Se
    corrigió sembrando `Educator` en el `beforeEach` de ese archivo (helper `seedEducator`,
    agregado en `test/helpers/fixtures.ts` durante la Fase 1) y actualizando las aserciones
    de `OutboxEmail` para esperar las dos filas nuevas con el destinatario correcto.
  - Nota para la spec siguiente (el job de vencimiento): usa el mismo patrón
    `tx.educator.findFirstOrThrow()` — cualquier e2e que dispare una transición de estado por
    vencimiento también necesitará una `Educator` sembrada.
  - Nota (spec 005, avisos en tiempo real): el job de vencimiento también debe avisar al panel.
    Tras el commit de cada `PENDING` → `NOT_CONFIRMED`, llamar a `SessionEventsService.emit(...)`
    con `sessionEvent({ kind: 'NOT_CONFIRMED', actor: 'SYSTEM', ... })` y escribir
    `statusChangedBy: 'SYSTEM'`/`statusChangedAt`, para que la campana (`deriveActivity`) lo
    muestre. Ver `../005-avisos-tiempo-real/spec.md`.
- Suite completa en verde tras la Fase 9: 107 unitarios + 138 e2e + lint + build.
- **Fase 10 (cierre) completa**:
  - `DocumentBuilder.addBearerAuth()` en `src/main.ts` y en `src/scripts/export-openapi.ts`
    (duplica la misma config — antes ninguno de los dos lo tenía, los `@ApiBearerAuth()` no
    tenían esquema de seguridad asociado en el OpenAPI).
  - `test/swagger-coverage.e2e-spec.ts` ampliado con las 24 rutas nuevas del panel (36 tests).
  - `pnpm docs:openapi` corrido: `docs/openapi.json` pasó de 13 a 37 operaciones documentadas.
  - `docs/API.md` reescrito: tabla de endpoints del panel, sección "Autenticación de la
    educadora", lista de códigos de error nuevos (incluido `CHILD_EXISTS`), "Qué no hay
    todavía" actualizado.
  - `CLAUDE.md` de esta app: tabla de endpoints del panel por módulo, más 4 bullets nuevos en
    "Arquitectura y convenciones" (JWT de la educadora, el fix del `P2002` del driver
    adapter, `DomainError.code` ahora `string`, nota sobre el timeout transitorio de e2e).
  - `../CLAUDE.md` (raíz): actualizado en la Fase 0, ya reflejaba la 004 en curso.
  - Verificación final: `pnpm test` (107), `pnpm test:e2e` (162, incluye las 24 nuevas de
    Swagger), `pnpm lint`, `pnpm build`, todo en verde. Verificación manual con `curl` contra
    Postgres real y el servidor corriendo de verdad: login de la educadora, `GET /summary`,
    `GET /preferences`, `GET /agenda`, 401 sin token y 401 con token de otra superficie — los
    cinco casos se comportaron como documentan `spec.md` y `docs/API.md`.
  - No se repitió la simulación de "clon limpio" completa que hizo la spec 001 (destruir
    `node_modules`/volumen Docker y reinstalar desde cero): es una operación destructiva que
    esta spec no toca (no cambia nada de infraestructura, dependencias o scripts de
    instalación), así que no se justificaba sin pedirlo explícitamente.
- **Los 25 criterios de aceptación de `spec.md` están marcados.** Única desviación del
  diseño original: se agregó el código `CHILD_EXISTS` (no estaba en la lista de
  `panel-messages.ts` del requisito 15), anotada en `spec.md`.
- Suite final: **107 unitarios + 162 e2e + lint + build**, todo en verde.

Ver `~/.claude/plans/crea-un-plan-para-fancy-iverson.md` para el contexto completo de la
revisión que originó esta spec.
