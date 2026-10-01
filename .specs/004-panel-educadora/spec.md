# Spec: Panel de la educadora

## Objetivo

Dar a la educadora un panel autenticado que reemplace los mocks de solo lectura de
`private-profesor-scheduling/` con datos reales: iniciar sesión, ver su resumen, su agenda
semanal y sus preferencias, y administrar la agenda (citas únicas y series, mover, cancelar,
marcar confirmada, bloquear cupos, editar plantilla y preferencias, fichas de apoderado y
niño).

Contexto y decisiones de arquitectura: `~/.claude/plans/crea-un-plan-para-fancy-iverson.md`.
Reglas de negocio: `../../../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md` y
`../../../AGENTS_PRIVATE.md`. Estado previo: `001-fundaciones-dominio` dejó el esquema
(`Educator`, `TemplateSlot`, `DayBlock`, `SlotBlock`, `Preferences`, `Series`) sin un solo
endpoint que lo use; `003-reserva-publica` dejó el patrón de autenticación JWT del apoderado
a replicar (no reutilizar tal cual: es otra audiencia).

Esta spec **no** toca `public-parents-scheduling-web/` ni el contrato congelado del
apoderado (`docs/API.md`, rutas bajo `/api/auth`, `/api/bookings`, `/api/sessions`,
`/api/slots`) salvo dos puntos explícitos: completar el envío del correo a la educadora en
`confirmByToken`/`cancelByToken`, y el refactor interno (no de contrato) de
`SlotsService`.

## Requisitos funcionales

### 1. Autenticación de la educadora

- Módulo nuevo `src/panel/auth/`, independiente de `src/auth/` (audiencia distinta: un solo
  usuario, sin Bearer opcional).
- JWT propio con secreto separado: `EDUCATOR_JWT_SECRET` (`z.string().min(32)`) en
  `src/config/env.ts`. Payload `{ sub: educatorId, tokenVersion, role: 'educator' }`.
- `POST /api/panel/auth/login` `{email,password}` → `{token, educator:{id,name,email}}`.
  401 `INVALID_CREDENTIALS` sin distinguir "no existe" de "clave mala" (mismo criterio que
  el apoderado).
- `POST /api/panel/auth/logout` → 204 siempre.
- `GET /api/panel/auth/me` → `{educator}`. Requiere sesión, 401 `NO_SESSION` si no.
- `POST /api/panel/auth/password` `{currentPassword,newPassword}` → verifica la actual,
  rehashea con argon2, incrementa `Educator.tokenVersion` (invalida el token viejo) y
  devuelve `{token}` nuevo en la misma transacción. 401 `INVALID_CREDENTIALS` si
  `currentPassword` no coincide; 400 `WEAK_PASSWORD` si `newPassword` no cumple el mínimo.
- No hay flujo de "olvidé mi clave": usuaria única, sin correo de recuperación. Recuperación
  operativa: `pnpm db:seed` con `SEED_EDUCATOR_PASSWORD` nuevo (documentar en `README.md`).
- Todas las rutas bajo `/api/panel/*` excepto `POST /panel/auth/login` exigen
  `Authorization: Bearer <jwt-educadora>` válido y con `tokenVersion` vigente. Un token de
  apoderado nunca debe pasar el guard (secreto distinto, ni siquiera llega a decodificar).

### 2. Cupos: refactor de `SlotsService`

- Extraer `buildWeekGrid(mondayYmd): SlotCell[]` en `src/slots/`, que conserva **todos** los
  candidatos de la semana (sin descartar días bloqueados) y resuelve un campo `state` con
  precedencia `BOOKED > BLOCKED_DAY > BLOCKED_SLOT > BEYOND_HORIZON > FREE`.
- `SlotCell = { date, time, startsAt, past, state, session? }`, con `session` presente solo
  si `state === 'BOOKED'`.
- `buildWeekSlots` (el contrato público congelado, `SlotView`) se reimplementa como una
  proyección de `buildWeekGrid`: **su forma de respuesta no cambia**. `test/slots.e2e-spec.ts`
  no se modifica y debe seguir pasando.
- `buildWeekGrid` incluye como candidato cualquier `startsAt` de una sesión activa
  (`PENDING`/`CONFIRMED`) de la semana aunque no exista fila `TemplateSlot` para esa hora
  (ver requisito 8: la educadora puede agendar fuera de plantilla).

### 3. Resumen (`GET /api/panel/summary?date=`)

`date` opcional (`YYYY-MM-DD`, día de calendario Chile; por defecto hoy). Responde:

```
{
  today: "YYYY-MM-DD",
  weekStart: "YYYY-MM-DD",       // lunes de la semana de `today`
  educator: { id, name, email },
  stats: {
    today: number,               // sesiones PENDING|CONFIRMED del día, incluidas las pasadas
    confirmed: number,            // CONFIRMED entre ahora y el domingo de la semana
    pending: number,              // PENDING con startsAt > ahora, sin tope de semana
    families: number              // guardianId distintos con sesión activa futura
  },
  todaySessions: PanelSession[],
  attention: PanelSession[],      // PENDING dentro de confirmationDeadlineHours desde ahora
  activity: ActivityItem[],       // derivado de Session, ver requisito 9
  nextFreeSlot: SlotCell | null   // primera celda FREE no pasada de la semana de `today`
}
```

`PanelSession = { id, date, time, childName, guardianName, guardianId, childId, status,
helpRequest, seriesId }`. `status` viaja como enum inglés
(`PENDING|CONFIRMED|NOT_CONFIRMED|CANCELLED`), no como el literal español del contrato
público: este contrato no está congelado.

### 4. Agenda (`GET /api/panel/agenda?weekStart=`)

`weekStart` obligatorio (lunes, `YYYY-MM-DD`; 400 `VALIDATION_ERROR` si falta o no es
lunes). Responde `{ weekStart, days: [{ date, weekday, dayBlocked, cells: SlotCell[] }] }`
para los 7 días de la semana (lunes a domingo: la plantilla puede incluir el domingo).

### 5. Preferencias (`GET /api/panel/preferences`)

```
{
  workWeek: [{ weekday, available, start, end, times, contiguous }],  // 7 entradas, dom..sáb
  confirmationDeadlineHours: number,
  seriesNoticeHours: number,
  bookingHorizonWeeks: number
}
```

`workWeek` se deriva de `TemplateSlot` agrupando por `weekday`. `start`/`end` son el rango
`[min, max+1h)`; `times` es la lista real de horas; `contiguous` es `false` si `times` no
forma un rango sin huecos (la UI debe avisar en vez de asumir el rango).

### 6. Crear cita única (`POST /api/panel/sessions`)

`{ childId, startsAt, helpRequest? }`. Valida: `childId` existe (404 `CHILD_NOT_FOUND`);
`startsAt` no es pasado (400 `PAST_SLOT`); el cupo no está bloqueado (409 `SLOT_BLOCKED`).
Estado inicial con `initialSessionStatus(startsAt, confirmationDeadlineHours)`.
`createdBy: 'EDUCATOR'`. Colisión real (`P2002` del índice parcial) → 409 `SLOT_TAKEN`.
Escribe `OutboxEmail` al apoderado (`BOOKING_PENDING`/`BOOKING_CONFIRMED`), nunca a la
educadora.

### 7. Crear serie (`POST /api/panel/series`)

`{ childId, weekday, time, startDate, endDate }`. `expandSeriesDates` genera las fechas;
antes de escribir se filtran las que ya tienen sesión activa, están bloqueadas (día o cupo)
o son pasadas, y se listan en `skipped: [{date, reason}]` (`reason` ∈
`OCCUPIED|DAY_BLOCKED|SLOT_BLOCKED|PAST`). Si no queda ninguna fecha → 400 `SERIES_EMPTY`,
sin crear la `Series`. Si queda al menos una, se crea la `Series` y sus `Session` en una
sola transacción (`createMany`, no un bucle con `create` individuales: una colisión a mitad
de camino abortaría toda la transacción de todos modos). Cada sesión nace con
`initialSessionStatus` según su propio `startsAt`. Solo las sesiones ya dentro de
`seriesNoticeHours` reciben `OutboxEmail` al crear la serie; el resto queda con
`noticeSentAt: null` para que las despache el job de la spec siguiente.

### 8. Mover sesión (`PATCH /api/panel/sessions/:id/move`)

`{ startsAt }`. Sesión debe existir, estar activa y no pasada. Un solo `update` de
`startsAt` (+ `status` recalculado con `initialSessionStatus`) libera el cupo anterior de
forma atómica vía `session_active_slot`. `P2002` sobre el destino → 409 `SLOT_TAKEN`.
Escribe `OutboxEmail` `RESCHEDULED` (kind nuevo en `OutboxKind`) al apoderado. Sin correo a
la educadora.

### 9. Marcar confirmada / cancelar

- `POST /api/panel/sessions/:id/confirm`: solo si `status === 'PENDING'`, si no 409
  `NOT_PENDING`. → `CONFIRMED`, `statusChangedBy: 'EDUCATOR'`, `statusChangedAt: now()`.
  `OutboxEmail` `CONFIRMED` al apoderado.
- `POST /api/panel/sessions/:id/cancel`: `canCancelSession` (activa y antes de la hora), si
  no 409 `CANCEL_NOT_ALLOWED`. → `CANCELLED`, mismos campos de actor. `OutboxEmail`
  `CANCELLED` al apoderado.

### 10. Actor del cambio de estado (columnas nuevas)

`Session` gana dos columnas nullable: `statusChangedBy Actor?`, `statusChangedAt DateTime?`.
Se escriben en cada transición manual (confirmar, cancelar, mover) y en las automáticas del
flujo público (`confirmByToken`, `cancelByToken`, con `statusChangedBy: 'GUARDIAN'`). No se
escriben al crear la sesión (`createdBy` ya cubre el alta). Migración nueva sobre el esquema
de la 001, sin tocar el índice parcial existente.

### 11. `confirmByToken`/`cancelByToken`: completar el aviso a la educadora

Hoy (`src/bookings/bookings.service.ts:225-256`) esos dos métodos solo escriben
`OutboxEmail` al apoderado. Se agrega, en la misma transacción, un `OutboxEmail` a la
educadora (`GUARDIAN_CONFIRMED`/`GUARDIAN_CANCELLED`, kinds nuevos) **solo cuando el cambio
no lo hizo ella misma**, es decir siempre en estos dos flujos (el token es exclusivo del
apoderado). El recipiente es `Educator.email` (única fila).

### 12. Bloqueos y plantilla

- `POST /api/panel/blocks/day` `{date}` / `DELETE /api/panel/blocks/day/:date`: bloquear un
  día. 409 `SLOT_NOT_EMPTY` si hay alguna sesión activa ese día. `upsert` sobre `@@unique`;
  desbloquear es idempotente (204 aunque no exista).
- `POST /api/panel/blocks/slot` `{date,time}` / `DELETE /api/panel/blocks/slot/:date/:time`:
  igual, a nivel de cupo puntual.
- `PUT /api/panel/template` `{ workWeek: [{weekday, available, start, end}] }`: reemplaza la
  plantilla completa. Se traduce a filas `TemplateSlot` (`templateRowsFromWorkWeek`), se
  calcula el diff contra las filas actuales y se aplica `deleteMany` + `createMany` en una
  transacción. Las sesiones ya creadas **nunca se tocan** aunque su hora salga de la
  plantilla nueva; la respuesta incluye `orphanSessions: number` (sesiones activas futuras
  fuera de la plantilla resultante).
- `PUT /api/panel/preferences` `{confirmationDeadlineHours, seriesNoticeHours,
  bookingHorizonWeeks}`: `validatePreferences` exige `seriesNoticeHours >
  confirmationDeadlineHours`, los tres enteros positivos, `bookingHorizonWeeks` entre 1 y
  52. Si falla, 400 `INVALID_PREFERENCES` y no se escribe nada.

### 13. Fichas de apoderado y niño

- `GET /api/panel/guardians?query=`: lista con `childrenCount`, `activeSessions`.
- `GET /api/panel/guardians/:id`: ficha completa con `children[]` y `sessions[]` (histórico,
  todos los estados).
- `POST /api/panel/guardians` `{name,email,phone}`: 409 `GUARDIAN_EXISTS` si el email ya
  existe.
- `PATCH /api/panel/guardians/:id` `{name?,phone?}`.
- `POST /api/panel/guardians/:id/children` `{name,age}`: **sin** el rango 3–13 (permitido
  solo desde el panel). `normalizedName` calculado con `normalizeName`, respeta
  `@@unique[guardianId, normalizedName]` → 409 si ya existe un niño con ese nombre para ese
  apoderado.
- `PATCH /api/panel/children/:id` `{name?,age?}`.

### 14. Fuera de plantilla permitido

La educadora puede crear una cita o serie en una hora que no está en su `TemplateSlot`
actual. La plantilla solo determina qué cupos ve el apoderado en `GET /api/slots`; no
restringe al panel. No existe el código `SLOT_NOT_IN_TEMPLATE`.

### 15. Swagger y errores

- Cada controlador nuevo con `@ApiTags('panel-auth'|'panel-summary'|'panel-agenda'|
  'panel-sessions'|'panel-schedule'|'panel-people')`, `@ApiOperation`, `@ApiResponse` por
  código documentado en esta spec. Ampliar `expectedOperations` de
  `test/swagger-coverage.e2e-spec.ts`.
- `DocumentBuilder` en `src/main.ts` agrega `.addBearerAuth()` (falta hoy: los
  `@ApiBearerAuth()` existentes no tienen esquema de seguridad asociado).
- Mensajes nuevos en `src/common/errors/panel-messages.ts` (`PanelErrorMessage`), separado
  de `src/common/errors/messages.ts` (ese archivo es copia textual del contrato congelado
  del apoderado, no se toca). Códigos nuevos: `SESSION_NOT_FOUND`, `GUARDIAN_NOT_FOUND`,
  `CHILD_NOT_FOUND`, `SLOT_BLOCKED`, `SLOT_NOT_EMPTY`, `NOT_PENDING`, `CANCEL_NOT_ALLOWED`,
  `SLOT_TAKEN`, `INVALID_PREFERENCES`, `SERIES_EMPTY`, `GUARDIAN_EXISTS`, `NO_SESSION`,
  `INVALID_CREDENTIALS`, `WEAK_PASSWORD`, `VALIDATION_ERROR`. **Agregado durante la
  implementación**, no previsto en este listado original: `CHILD_EXISTS` (409, nombre de
  niño repetido para el mismo apoderado — la única forma de violar el
  `@@unique[guardianId, normalizedName]` de `Child` desde el panel).

## Fuera de alcance

- Tocar `public-parents-scheduling-web/` o el contrato congelado del apoderado (salvo el
  requisito 11, que es un fix acotado, no un cambio de contrato).
- El job que despacha `OutboxEmail` o vence sesiones `PENDING` → `NOT_CONFIRMED` (spec
  siguiente).
- El envío real de correos (Resend): esta spec solo agrega filas a `OutboxEmail`.
- Ficha por alumno con historial narrativo (`../../../AGENTS_PRIVATE.md`, "Próximamente");
  el requisito 13 cubre solo la ficha de datos, no esa vista.
- Rate limiting en `POST /panel/auth/login`.
- Flujo de recuperación de clave de la educadora por correo.
- Adaptar `private-profesor-scheduling/` (spec propia: `001-conectar-panel` en ese repo).

## Criterios de aceptación

- [x] Un token de apoderado (`/api/auth/login`) responde 401 en cualquier ruta `/api/panel/*`
      distinta de `login`.
- [x] Un token de educadora responde 401 en `GET /api/auth/me` (superficie del apoderado).
- [x] `POST /api/panel/auth/login` con clave incorrecta responde 401 `INVALID_CREDENTIALS`.
- [x] `POST /api/panel/auth/password` exitoso invalida el token anterior (`tokenVersion`);
      el nuevo token sirve.
- [x] `test/slots.e2e-spec.ts` pasa sin modificarse tras el refactor de `SlotsService`.
- [x] Una sesión con una hora que ya no está en la plantilla sigue apareciendo en
      `GET /api/panel/agenda` como celda `BOOKED`.
- [x] Un día con `DayBlock` muestra sus celdas como `BLOCKED_DAY` en la agenda del panel (a
      diferencia de `GET /api/slots`, que las omite).
- [x] `GET /api/panel/summary` calcula las 4 métricas según las ventanas definidas en el
      requisito 3, verificado con datos sembrados a mano.
- [x] Crear una cita en un cupo con sesión activa responde 409 `SLOT_TAKEN`.
- [x] Crear una cita en un cupo bloqueado responde 409 `SLOT_BLOCKED`.
- [x] Crear una cita fuera de la plantilla semanal se acepta (no existe `SLOT_NOT_IN_TEMPLATE`).
- [x] Mover una sesión libera el cupo anterior: `GET /api/slots` lo ve `available: true`
      inmediatamente después.
- [x] Mover a una hora con plazo ya vencido deja la sesión `CONFIRMED`.
- [x] Crear una serie que cruza fechas ocupadas y bloqueadas las omite y las reporta en
      `skipped` con el `reason` correcto; las demás se crean.
- [x] Una serie sin ninguna fecha válida responde 400 `SERIES_EMPTY` y no crea la `Series`.
- [x] Marcar confirmada una sesión `CANCELLED` responde 409 `NOT_PENDING`.
- [x] Bloquear un día o cupo con una sesión activa responde 409 `SLOT_NOT_EMPTY`; desbloquear
      uno inexistente responde 204.
- [x] Editar la plantilla no borra ni modifica ninguna `Session` existente.
- [x] `PUT /api/panel/preferences` con `seriesNoticeHours <= confirmationDeadlineHours`
      responde 400 `INVALID_PREFERENCES` y la fila de `Preferences` queda sin cambios.
- [x] `POST /api/sessions/confirm/:token` (flujo del apoderado) deja una fila
      `OutboxEmail` nueva dirigida a la educadora, además de la del apoderado.
- [x] `POST /api/sessions/cancel/:token` ídem con `GUARDIAN_CANCELLED`.
- [x] Crear una cita o marcar confirmada/cancelar **desde el panel** no escribe ningún
      `OutboxEmail` dirigido a la educadora.
- [x] Crear un niño desde el panel acepta una edad fuera de 3–13.
- [x] Todos los endpoints nuevos aparecen en `/api/docs` con tag/summary/response por
      código; `test/swagger-coverage.e2e-spec.ts` pasa.
- [x] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.
