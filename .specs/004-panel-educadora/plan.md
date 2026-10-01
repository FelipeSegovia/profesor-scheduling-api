# Plan: Panel de la educadora

Diseño técnico de [`spec.md`](./spec.md). Estado previo: `001-fundaciones-dominio` (esquema,
dominio, errores), `002-documentacion-swagger` (`/api/docs`), `003-reserva-publica` (patrón
JWT del apoderado a replicar, `OutboxService`, índice `session_active_slot`).

## Estructura de módulos

```
src/panel/
  panel.module.ts                          # importa SlotsModule (buildWeekGrid), AuthModule no
  auth/
    panel-auth.controller.ts               # POST login, logout, GET me, POST password
    panel-auth.service.ts
    panel-auth.schemas.ts                  # Zod: loginSchema, passwordSchema
    panel-auth.types.ts                    # AuthResult, EducatorProfile
    educator-token.service.ts              # sign/verify, payload {sub,tokenVersion,role:'educator'}
    educator-context.middleware.ts         # Bearer OBLIGATORIO (a diferencia del guardian: aquí
                                            # un Bearer ausente/inválido también deja request.educator
                                            # sin definir, pero el guard exige sesión en TODAS las rutas
                                            # salvo login, no solo en /me)
    educator-auth.guard.ts
    educator.decorator.ts                  # @CurrentEducator()
  dashboard/
    panel-dashboard.controller.ts          # GET /panel/summary
    panel-dashboard.service.ts
    panel-dashboard.types.ts
  agenda/
    panel-agenda.controller.ts             # GET /panel/agenda
    panel-agenda.service.ts
    panel-agenda.types.ts
  sessions/
    panel-sessions.controller.ts           # POST /panel/sessions, /series,
                                            # PATCH /:id/move, POST /:id/confirm, /:id/cancel
    panel-sessions.service.ts
    panel-sessions.schemas.ts              # Zod: createSessionSchema, createSeriesSchema, moveSchema
  schedule/
    panel-schedule.controller.ts           # GET/PUT /panel/preferences, PUT /panel/template,
                                            # POST/DELETE /panel/blocks/day(+:date), /panel/blocks/slot(+:date/:time)
    panel-schedule.service.ts
    panel-schedule.schemas.ts
  people/
    panel-people.controller.ts             # /panel/guardians, /panel/children
    panel-people.service.ts
    panel-people.schemas.ts
  panel.dto.ts                             # sessionToPanelDto, guardianToPanelDto, childToPanelDto

src/slots/
  slot-grid.ts                             # SlotState, SlotCell, resolveSlotState() — nuevo
  slots.service.ts                         # + buildWeekGrid(mondayYmd), buildWeekSlots reescrito
                                            # como proyección de buildWeekGrid

src/domain/
  schedule.ts                              # + schedule.spec.ts
  series.ts                                # + series.spec.ts
  preferences.ts                           # + preferences.spec.ts
  activity.ts                              # + activity.spec.ts
  booking.ts                               # + canMoveSession, canMarkConfirmed (+ tests)
  time.ts                                  # + todayChileYmd, chileDayRange, weekSundayYmd,
                                            #   weekDaysMonSunYmd (7 días) (+ tests)

src/common/errors/
  panel-messages.ts                        # PanelErrorMessage, separado de messages.ts

src/outbox/
  outbox.service.ts                        # OutboxKind += RESCHEDULED, GUARDIAN_CONFIRMED, GUARDIAN_CANCELLED

src/bookings/
  bookings.service.ts                      # confirmByToken/cancelByToken: + outbox a la educadora
                                            # + statusChangedBy/statusChangedAt

prisma/
  schema.prisma                            # Session += statusChangedBy Actor?, statusChangedAt DateTime?
  migrations/<ts>_add_session_status_actor/migration.sql

src/main.ts                                # DocumentBuilder += .addBearerAuth()
src/config/env.ts                          # + EDUCATOR_JWT_SECRET

test/
  panel-auth.e2e-spec.ts
  panel-dashboard.e2e-spec.ts
  panel-agenda.e2e-spec.ts
  panel-sessions.e2e-spec.ts
  panel-series.e2e-spec.ts
  panel-schedule.e2e-spec.ts
  panel-people.e2e-spec.ts
  swagger-coverage.e2e-spec.ts             # expectedOperations += ~22 rutas nuevas
```

## Diseño

### 1. Migración: `statusChangedBy` / `statusChangedAt`

```prisma
model Session {
  // ...existente...
  /// Quién originó la última transición de estado (confirmar/cancelar/vencer),
  /// distinto de `createdBy` (quién creó la sesión). Null mientras el estado
  /// no ha cambiado desde la creación. Determina si la educadora recibe correo
  /// (solo si el cambio no lo hizo ella) y alimenta "actividad reciente".
  statusChangedBy   Actor?
  statusChangedAt   DateTime?
}
```

Migración aditiva, sin tocar `session_active_slot`. Todo escritor de una transición
(`confirmByToken`, `cancelByToken`, y las nuevas de `panel-sessions.service.ts`) setea ambos
campos en el mismo `update`. La creación de una sesión no los toca (quedan `null`).

### 2. Autenticación de la educadora

**Diferencia deliberada con `GuardianContextMiddleware`**: ahí el Bearer es opcional porque
la mayoría de rutas del apoderado funcionan sin sesión. Aquí **todas** las rutas de
`/api/panel/*` excepto `login` requieren sesión, así que `EducatorContextMiddleware` sigue
sin lanzar nunca (deja `request.educator` sin definir ante cualquier problema), pero
`EducatorAuthGuard` se aplica como `APP_GUARD` del módulo completo salvo el endpoint de
login, en vez de solo en una ruta.

```ts
// educator-token.service.ts
export interface EducatorTokenPayload { sub: string; tokenVersion: number; role: 'educator'; }

@Injectable()
export class EducatorTokenService {
  constructor(@Inject(EDUCATOR_JWT) private readonly jwt: JwtService) {}
  async sign(educator: {id: string; tokenVersion: number}): Promise<string> {
    return this.jwt.signAsync({ sub: educator.id, tokenVersion: educator.tokenVersion, role: 'educator' });
  }
  async verify(token: string): Promise<EducatorTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<EducatorTokenPayload>(token);
      return payload.role === 'educator' ? payload : null;
    } catch { return null; }
  }
}
```

Segundo `JwtModule` registrado con un *token* de inyección propio (`EDUCATOR_JWT`) para no
colisionar con el `JwtService` por defecto que usa `AuthModule` — se registra dentro de
`PanelModule`, no se comparte.

`EducatorContextMiddleware` decodifica el Bearer contra `EducatorTokenService`, busca
`Educator` por `payload.sub`, valida `tokenVersion`, setea `request.educator`.
`EducatorAuthGuard` exige `request.educator`, si no 401 `NO_SESSION`. Se registra con
`APP_GUARD` dentro de `PanelModule.providers` pero con un decorator `@Public()` en el
controlador de login para excluirlo (patrón estándar de Nest), en vez de excluir rutas una
por una en `configure()`.

Login/cambio de clave en `panel-auth.service.ts`, calcado de `auth.service.ts` pero contra
`Educator`: `argon2.verify`, `assertPassword` (reutiliza `PASSWORD_MIN_LENGTH` de
`src/domain/auth.ts`), `tokenVersion++` en `password`.

### 3. `SlotCell` y `buildWeekGrid`

```ts
// src/slots/slot-grid.ts
export type SlotState = 'FREE' | 'BOOKED' | 'BLOCKED_DAY' | 'BLOCKED_SLOT' | 'BEYOND_HORIZON';

export interface SlotCell {
  date: string; time: string; startsAt: string; past: boolean; state: SlotState;
  session?: { id: string; status: SessionStatus; childId: string; guardianId: string };
}

export function resolveSlotState(input: {
  occupied: boolean; dayBlocked: boolean; slotBlocked: boolean; beyondHorizon: boolean;
}): SlotState {
  if (input.occupied) return 'BOOKED';
  if (input.dayBlocked) return 'BLOCKED_DAY';
  if (input.slotBlocked) return 'BLOCKED_SLOT';
  if (input.beyondHorizon) return 'BEYOND_HORIZON';
  return 'FREE';
}
```

`buildWeekGrid(mondayYmd)` en `slots.service.ts`:
1. Candidatos = `TemplateSlot` × 7 días (lunes a domingo, no lunes a sábado) **unión** los
   `startsAt` de sesiones activas de la semana que no calzan con ningún `TemplateSlot`
   (subquery adicional: `Session.findMany({ startsAt: { in: weekRange }, status: {in:
   ACTIVE} })`, y los que no aparecen ya en `candidates` se agregan con su propio `date`/`time`).
2. Para cada candidato: `occupied` = hay sesión activa en ese `startsAt`; `dayBlocked`
   viene de `DayBlock`; `slotBlocked` de `SlotBlock`; `beyondHorizon` igual que hoy.
3. `state = resolveSlotState(...)`; `session` se arma con un `include` de `child`/`guardian`
   solo para las celdas `BOOKED` (un solo `findMany` con `include`, no N+1).

`buildWeekSlots` (contrato público) se reescribe:
```ts
async buildWeekSlots(mondayYmd: string): Promise<SlotView[]> {
  const grid = await this.buildWeekGrid(mondayYmd);
  return grid
    .filter((c) => weekDaysMonSatYmd(mondayYmd).includes(c.date) && c.state !== 'BLOCKED_DAY')
    .map((c) => ({
      date: c.date, time: c.time, startsAt: c.startsAt, past: c.past,
      available: c.state === 'FREE',
    }));
}
```
`test/slots.e2e-spec.ts` no cambia: mismo filtro lunes-sábado, mismo colapso a `available`.

### 4. Dominio puro nuevo

```ts
// src/domain/schedule.ts
export function expandRangeToHours(start: string, end: string): string[]  // ["19:00","20:00"]
export function collapseHoursToRange(times: string[]): {start: string; end: string}
export function isContiguousHourRange(times: string[]): boolean
export function templateRowsFromWorkWeek(workWeek: WorkDay[]): {weekday: number; time: string}[]
export function workWeekFromTemplateRows(rows: {weekday:number; time:string}[]): WorkDay[]

// src/domain/series.ts
export interface SeriesDate { date: string; startsAt: string; }
export function expandSeriesDates(input: {
  weekday: number; time: string; startDate: string; endDate: string;
}): SeriesDate[]  // todas las ocurrencias del weekday entre startDate y endDate, inclusive

// src/domain/preferences.ts
export function validatePreferences(input: {
  confirmationDeadlineHours: number; seriesNoticeHours: number; bookingHorizonWeeks: number;
}): string | null  // null = válido; string = código de error

// src/domain/activity.ts
export interface ActivityItem { id: string; kind: 'CREATED'|'CONFIRMED'|'CANCELLED'|'RESCHEDULED';
  title: string; meta: string; at: string; }
export function deriveActivity(sessions: SessionForActivity[], limit: number): ActivityItem[]
  // createdAt → CREATED; si statusChangedAt existe y es distinto de createdAt → evento
  // adicional según status+statusChangedBy. Ordenado desc por el evento más reciente de cada sesión.
```

### 5. Resumen — cálculo exacto

```ts
const now = new Date();
const dayRange = chileDayRange(date);          // [00:00, 24:00) Chile del día pedido
const weekEnd = chileDayRange(weekSundayYmd(weekMondayYmd(date)))[1];

stats.today = count({ startsAt: { gte: dayRange[0], lt: dayRange[1] }, status: { in: ACTIVE } });
stats.confirmed = count({ startsAt: { gte: now, lt: weekEnd }, status: 'CONFIRMED' });
stats.pending = count({ startsAt: { gt: now }, status: 'PENDING' });
stats.families = (await groupBy({ by: ['guardianId'], where: { startsAt: { gt: now }, status: { in: ACTIVE } } })).length;
```

`attention` = `PENDING` con `startsAt <= now + confirmationDeadlineHours` y `startsAt > now`,
orden ascendente. `nextFreeSlot` = primera celda de `buildWeekGrid(weekMondayYmd(date))` con
`state === 'FREE' && !past`, en orden cronológico.

### 6. Mutaciones de sesión — servicio

`panel-sessions.service.ts` reutiliza directamente de `bookings.service.ts` el patrón
(no el código: `BookingsService` es privado a su módulo) — mismo orden: validar → transacción
→ capturar `P2002` con `isSlotTakenViolation` → outbox. Ejemplo de `move`:

```ts
async move(id: string, startsAtIso: string): Promise<PanelSessionDto> {
  const session = await this.prisma.session.findUniqueOrThrow({ where: { id } });
  if (!ACTIVE.has(session.status)) throw new DomainError(..., 404, 'SESSION_NOT_FOUND');
  if (!canMoveSession(session)) throw new DomainError(..., 409, 'CANCEL_NOT_ALLOWED');
  if (isPastSlot(startsAtIso)) throw new DomainError(..., 400, 'PAST_SLOT');

  const prefs = await this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
  const nextStatus = initialSessionStatus(startsAtIso, prefs.confirmationDeadlineHours);

  const updated = await this.prisma.$transaction(async (tx) => {
    let updated;
    try {
      updated = await tx.session.update({
        where: { id },
        data: { startsAt: new Date(startsAtIso), status: nextStatus,
                 statusChangedBy: 'EDUCATOR', statusChangedAt: new Date() },
      });
    } catch (err) {
      if (isSlotTakenViolation(err)) throw new DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN');
      throw err;
    }
    const guardian = await tx.guardian.findUniqueOrThrow({ where: { id: updated.guardianId } });
    await this.outbox.write({ kind: OutboxKind.RESCHEDULED, recipient: guardian.email, sessionId: id }, tx);
    return updated;
  });
  return this.toDto(updated);
}
```

### 7. Series — filtrar antes de escribir

```ts
async createSeries(body: CreateSeriesBody): Promise<{series, created, skipped}> {
  const dates = expandSeriesDates(body);
  const [activeSessions, dayBlocks, slotBlocks] = await Promise.all([
    this.prisma.session.findMany({ where: { startsAt: { in: dates.map(d => new Date(d.startsAt)) }, status: { in: ACTIVE } } }),
    this.prisma.dayBlock.findMany({ where: { date: { in: dates.map(d => chileDateToColumn(d.date)) } } }),
    this.prisma.slotBlock.findMany({ where: { date: { in: dates.map(d => chileDateToColumn(d.date)) }, time: body.time } }),
  ]);
  const occupied = new Set(activeSessions.map(s => s.startsAt.toISOString()));
  const blockedDays = new Set(dayBlocks.map(b => columnToChileDate(b.date)));
  const blockedSlots = new Set(slotBlocks.map(b => columnToChileDate(b.date)));

  const { toCreate, skipped } = dates.reduce(/* clasifica cada fecha: PAST > OCCUPIED > DAY_BLOCKED > SLOT_BLOCKED */);
  if (toCreate.length === 0) throw new DomainError(..., 400, 'SERIES_EMPTY');

  const { series, created } = await this.prisma.$transaction(async (tx) => {
    const series = await tx.series.create({ data: { childId: body.childId, guardianId, weekday: body.weekday, time: body.time, startDate: ..., endDate: ... } });
    await tx.session.createMany({ data: toCreate.map(d => ({
      childId: body.childId, guardianId, seriesId: series.id, startsAt: new Date(d.startsAt),
      status: initialSessionStatus(d.startsAt, prefs.confirmationDeadlineHours),
      confirmToken: randomToken(), cancelToken: randomToken(), createdBy: 'EDUCATOR',
    })) });
    // outbox solo para las que ya están dentro de seriesNoticeHours
    for (const d of toCreate.filter(inNoticeWindow)) {
      await this.outbox.write({ kind: ..., recipient: guardian.email, sessionId: ... }, tx);
    }
    return { series, created: toCreate };
  });
  return { series, created, skipped };
}
```

Si el `createMany` choca (carrera real con el formulario público a mitad de la ventana entre
el chequeo y la escritura) la transacción entera falla con 409 `SLOT_TAKEN` y no hay reintento
automático — se documenta como comportamiento aceptado (ventana de colisión, no bug).

### 8. Plantilla — diff y `orphanSessions`

```ts
async replaceTemplate(workWeek: WorkDayInput[]): Promise<{orphanSessions: number}> {
  const rows = templateRowsFromWorkWeek(workWeek);
  const current = await this.prisma.templateSlot.findMany();
  const toDelete = current.filter(c => !rows.some(r => r.weekday === c.weekday && r.time === c.time));
  const toCreate = rows.filter(r => !current.some(c => c.weekday === r.weekday && c.time === r.time));

  await this.prisma.$transaction([
    this.prisma.templateSlot.deleteMany({ where: { id: { in: toDelete.map(d => d.id) } } }),
    this.prisma.templateSlot.createMany({ data: toCreate }),
  ]);

  const future = await this.prisma.session.findMany({ where: { startsAt: { gt: new Date() }, status: { in: ACTIVE } } });
  const orphanSessions = future.filter(s => !rows.some(r => matchesTemplateRow(r, s.startsAt))).length;
  return { orphanSessions };
}
```

### 9. Errores — `panel-messages.ts`

```ts
export const PanelErrorMessage = {
  SESSION_NOT_FOUND: 'Sesión no encontrada.',
  GUARDIAN_NOT_FOUND: 'Apoderado no encontrado.',
  CHILD_NOT_FOUND: 'Niño no encontrado.',
  SLOT_BLOCKED: 'Ese cupo está bloqueado.',
  SLOT_NOT_EMPTY: 'Ese cupo tiene una sesión activa. Cancélala o muévela antes de bloquear.',
  INVALID_PREFERENCES: 'La antelación del correo de serie debe ser mayor que el plazo de confirmación.',
  SERIES_EMPTY: 'Todas las fechas de la serie están ocupadas, bloqueadas o ya pasaron.',
  GUARDIAN_EXISTS: 'Ya existe un apoderado con ese correo.',
  // reutiliza de ErrorMessage: SLOT_TAKEN, PAST_SLOT, NOT_PENDING, CANCEL_NOT_ALLOWED,
  // NO_SESSION, INVALID_CREDENTIALS, VALIDATION_ERROR — mismo texto, sin duplicar.
} as const;
```

`AllExceptionsFilter` no cambia: ya traduce cualquier `DomainError` sin importar de qué
archivo de mensajes venga.

### 10. Completar `confirmByToken`/`cancelByToken`

```ts
// bookings.service.ts, dentro de la misma transacción existente
await tx.session.update({ where: { id: session.id },
  data: { status: 'CONFIRMED', statusChangedBy: 'GUARDIAN', statusChangedAt: new Date() } });
const educator = await tx.educator.findFirstOrThrow();
await this.outbox.write({ kind: OutboxKind.GUARDIAN_CONFIRMED, recipient: educator.email, sessionId: session.id }, tx);
```
Análogo en `cancelByToken` con `GUARDIAN_CANCELLED`. `findFirstOrThrow` porque hay una sola
`Educator` (documentado en el seed); si en el futuro hay más de una educadora esto cambia,
pero está fuera de alcance del MVP.

## Riesgos aceptados (de la revisión con el usuario)

- Actividad reciente pierde historial intermedio (solo el último cambio por sesión):
  aceptado, mitigado por las columnas `statusChangedBy`/`statusChangedAt`.
- Sin rate limiting en el login del panel: anotado, fuera de alcance.
- Ventana de colisión entre el filtrado de `createSeries` y el `createMany`: aceptado, se
  resuelve con un 409 y reintento manual de la educadora.

## Tests

**Unitarios** (`*.spec.ts` junto al código, sin BD):
- `schedule.spec.ts`: `expandRangeToHours` (vacío, `end<=start`, un solo valor), ida/vuelta
  `templateRowsFromWorkWeek` ↔ `workWeekFromTemplateRows`, `isContiguousHourRange`.
- `series.spec.ts`: `expandSeriesDates` (weekday que no cae en `startDate`, `endDate`
  inclusive, rango de 1 día, cruce de cambio de horario de Chile — dos TZ, como `time.spec.ts`).
- `preferences.spec.ts`: `seriesNoticeHours === confirmationDeadlineHours` → inválido; límites
  de `bookingHorizonWeeks`.
- `activity.spec.ts`: sesión sin cambios (solo `CREATED`), con cambio (`CREATED` + evento),
  orden por recencia.
- `slot-grid.spec.ts`: tabla exhaustiva de `resolveSlotState` (las 5 combinaciones con
  precedencia).
- `booking.spec.ts` (ampliar): `canMoveSession`, `canMarkConfirmed`.
- `educator-auth.guard.spec.ts`: espejo de `guardian-auth.guard.spec.ts`.

**E2e** (`test/panel-*.e2e-spec.ts`, Postgres real, `fileParallelism: false`):
- Auth: login OK/mal; token de apoderado rechazado en panel; token de educadora rechazado en
  `/api/auth/me`; cambio de clave invalida el token viejo.
- Agenda: 5 estados de celda; sesión fuera de plantilla sigue visible; `test/slots.e2e-spec.ts`
  sin tocar, verde.
- Sesiones: crear en cupo ocupado/bloqueado/fuera de plantilla; mover libera cupo anterior
  (verificado contra `GET /api/slots`); mover a plazo vencido → `CONFIRMED`; confirmar sobre
  `CANCELLED` → 409; cancelar después de la hora → 409.
- Series: salta ocupados/bloqueados/pasados y los reporta; sin fechas válidas → 400.
- Horario: bloquear cupo ocupado → 409; editar plantilla no toca sesiones existentes;
  preferencias inválidas → 400 sin escribir.
- Personas: email duplicado → 409; edad fuera de 3–13 aceptada.
- Aviso a la educadora: `confirm`/`cancel` por token del apoderado dejan una fila
  `OutboxEmail` extra dirigida a `Educator.email`; las mutaciones del panel no dejan ninguna.
- `swagger-coverage.e2e-spec.ts` ampliado: todas las rutas nuevas con tag/summary/response.
