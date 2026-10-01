# Plan: Avisos en tiempo real al panel de la educadora

Diseño técnico de [`spec.md`](./spec.md). Estado previo: `004-panel-educadora` (auth de la
educadora con `EducatorContextMiddleware` + `EducatorAuthGuard` por `@UseGuards`,
`deriveActivity` en `src/domain/activity.ts`, `Session.statusChangedBy/At`).

## Estructura

```
src/events/
  events.module.ts                 # @Global(), provee y exporta SessionEventsService
  session-events.service.ts        # Subject<SessionEvent>; emit(), stream()
  session-events.types.ts          # SessionEventKind, SessionEvent
  session-events.ts                # sessionEvent(...) — arma el evento (id, at); puro
  session-events.spec.ts
src/domain/
  notifications.ts                 # deriveNotifications(activity, seenAt) — puro
  notifications.spec.ts
src/panel/
  activity.query.ts                # loadRecentActivity(prisma, limit) — extraído del dashboard
  events/
    panel-events.controller.ts     # @Sse GET /panel/events
  notifications/
    panel-notifications.controller.ts  # GET /panel/notifications, POST /seen
    panel-notifications.service.ts
    panel-notifications.types.ts
```

`EventsModule` se importa una sola vez en `AppModule`. Es `@Global()` porque lo inyectan
módulos que no se conocen entre sí (`BookingsModule` y `PanelModule`); así ninguno importa al
otro.

## Bus de eventos

```ts
@Injectable()
export class SessionEventsService implements OnModuleDestroy {
  private readonly subject = new Subject<SessionEvent>();
  emit(event: SessionEvent): void { this.subject.next(event); }
  stream(): Observable<SessionEvent> { return this.subject.asObservable(); }
  onModuleDestroy(): void { this.subject.complete(); }   // cierra los streams al apagar
}
```

`emit` es síncrono y nunca lanza hacia el llamador: un suscriptor que falla no puede romper una
reserva ya guardada (los `Subject` de rxjs aíslan errores de suscriptor solo si el suscriptor
no lanza dentro de `next`; el controlador SSE solo mapea, así que no lanza).

Helper puro `sessionEvent({ kind, sessionId, childName, startsAt, actor, at })` →
`SessionEvent` con `id = ${sessionId}:${kind}` y fechas en ISO. `MOVED` puede repetirse para
una misma sesión, así que su `id` no es único en el tiempo: el cliente no debe deduplicar por
`id`. Tampoco coincide con `ActivityItem.id` (el alta de la campana usa `:created`, el evento
`:CREATED`); para cruzar un evento con un ítem se compara `sessionId` y `kind`. No se cambia el
`id` de `deriveActivity` porque es parte de la respuesta de `GET /panel/summary` (spec 004).

### Puntos de emisión (siempre después de que resuelve `$transaction`)

| Servicio / método | `kind` | `actor` | De dónde salen `childName`/`startsAt`/`at` |
| --- | --- | --- | --- |
| `BookingsService.createBooking` | `CREATED` | `GUARDIAN` | `child.name`, `session.startsAt`, `session.createdAt` del resultado de la transacción |
| `BookingsService.confirmByToken` | `CONFIRMED` | `GUARDIAN` | bundle de `getBookingBundle` (ya se llama); `at` = el `statusChangedAt` escrito |
| `BookingsService.cancelByToken` | `CANCELLED` | `GUARDIAN` | ídem |
| `PanelSessionsService.createSession` | `CREATED` | `EDUCATOR` | DTO devuelto (`sessionToPanelDto` trae el niño) |
| `PanelSessionsService.createSeries` | `CREATED` × cada sesión creada | `EDUCATOR` | sesiones creadas en la transacción (incluir `child` en la lectura si hace falta) |
| `PanelSessionsService.move` | `MOVED` | `EDUCATOR` | DTO devuelto |
| `PanelSessionsService.confirm` / `cancel` | `CONFIRMED` / `CANCELLED` | `EDUCATOR` | DTO devuelto |

Las ramas idempotentes de `confirmByToken`/`cancelByToken` hacen `return` antes de la
transacción, así que no emiten sin código extra. `at` se fija una vez (`const now = new Date()`)
y se usa tanto en `statusChangedAt` como en el evento, para que coincida con lo que luego
derive la campana.

## Stream SSE

```ts
@ApiTags('panel-events')
@Controller('panel/events')
@UseGuards(EducatorAuthGuard)
export class PanelEventsController {
  @Sse()
  @ApiOperation({ summary: 'Stream de cambios de sesiones (Server-Sent Events)' })
  @ApiResponse({ status: 200, description: 'text/event-stream' })
  @ApiResponse({ status: 401, description: 'NO_SESSION' })
  stream(): Observable<MessageEvent> {
    return merge(
      this.events.stream().pipe(map((e) => ({ type: 'session', id: e.id, data: e }))),
      interval(PING_INTERVAL_MS).pipe(map(() => ({ type: 'ping', data: {} }))),
    );
  }
}
```

- Se agrega a `PANEL_CONTROLLERS` en `panel.module.ts` para que pase por
  `EducatorContextMiddleware`. El guard corre antes del handler, así que un 401 sale como JSON
  normal por `AllExceptionsFilter` (sin abrir el stream) — se verifica en e2e.
- Nest cierra la suscripción cuando el cliente corta la conexión (`req.on('close')`), así que
  no hay fuga de suscriptores.
- `PING_INTERVAL_MS = 25_000`, constante exportada para que el test no dependa del valor.
- Swagger: `@Sse` aparece en el esquema como `GET`; el `@ApiResponse` documenta
  `text/event-stream` y la forma de `SessionEvent` va en `docs/API.md`.

## Notificaciones

- Migración `add_educator_notifications_seen_at`: `Educator.notificationsSeenAt DateTime?`.
- `src/panel/activity.query.ts`: `loadRecentActivity(prisma, limit)` contiene hoy el
  `session.findMany({ include: { child: true }, orderBy: { updatedAt: 'desc' }, take: 50 })` +
  mapeo a `SessionForActivity` + `deriveActivity` de `PanelDashboardService.getSummary`. El
  dashboard pasa a llamarlo con `ACTIVITY_LIMIT` (15); su respuesta no cambia.
- `deriveNotifications(activity, seenAt)` (`src/domain/notifications.ts`):
  ```ts
  const items = activity.filter((a) => a.actor !== 'EDUCATOR')
    .map((a) => ({ ...a, unread: seenAt === null || new Date(a.at) > seenAt }));
  return { items, unreadCount: items.filter((i) => i.unread).length };
  ```
  `unreadCount` cuenta solo dentro de la ventana devuelta (limitación aceptada: la ventana es
  de 50 sesiones recientes).
- `PanelNotificationsService.list()`: `loadRecentActivity(prisma, ∞ dentro de las 50)` →
  `deriveNotifications` → `slice(0, 20)` sobre `items` (el conteo se calcula antes de cortar).
- `PanelNotificationsService.markSeen()`: `educator.update({ notificationsSeenAt: new Date() })`
  sobre la educadora de la sesión (`@CurrentEducator()`).
- Controlador con `@UseGuards(EducatorAuthGuard)`, `@ApiTags('panel-notifications')`; `seen`
  con `@HttpCode(204)`. Agregado a `PANEL_CONTROLLERS`.

## Tests

- Unitarios: `session-events.spec.ts` (forma e `id` del evento), `notifications.spec.ts`
  (filtra `EDUCATOR`, `seenAt` null, borde `at === seenAt` no es no leído, conteo).
- E2e `test/panel-events.e2e-spec.ts`:
  - Emisión (rápido y determinista): suscribirse a `app.get(SessionEventsService).stream()`,
    recolectar en un arreglo y verificar: reserva pública → `CREATED/GUARDIAN`; confirmar y
    cancelar por token → `CONFIRMED`/`CANCELLED`; repetir el mismo token → sin evento nuevo;
    `SLOT_TAKEN` → sin evento; cita única desde el panel → `CREATED/EDUCATOR`; `move` →
    `MOVED`.
  - HTTP real: `app.listen(0)`, `fetch` a `/api/panel/events` con Bearer de educadora, leer el
    `body` hasta encontrar `event: session` tras una reserva pública; abortar con
    `AbortController`. Sin token y con token de apoderado → 401 `NO_SESSION` (supertest).
- E2e `test/panel-notifications.e2e-spec.ts`: reserva pública sube `unreadCount`; cita del
  panel no; `seen` lo deja en 0 y una reserva posterior lo sube a 1; 401 sin token.
- `test/panel-dashboard.e2e-spec.ts` debe pasar sin modificarse (refactor de actividad).

## Documentación

- `docs/API.md`: sección "Avisos en tiempo real" (stream, formato `SessionEvent`, ping,
  reconexión sin `Last-Event-ID`, un solo proceso) y "Notificaciones".
- `pnpm docs:openapi`.
- `CLAUDE.md` de la app: filas nuevas en la tabla del panel, nota de `EventsModule` global y
  bus en memoria; marcar `005` en el flujo SDD.
- `../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`: sección "Avisos en el panel" y ajuste de la
  frase de §Correos. `../AGENTS_PRIVATE.md` (qué hace el panel) y `../CLAUDE.md` (hoja de
  ruta: siguiente spec del frontend).
- `.specs/004-panel-educadora/status.md`: nota de que el job de vencimiento debe emitir
  `NOT_CONFIRMED`/`SYSTEM`.

## Verificación end-to-end

```bash
pnpm start:dev
TOKEN=$(curl -s -X POST localhost:3000/api/panel/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"…","password":"…"}' | jq -r .token)
curl -N -H "Authorization: Bearer $TOKEN" localhost:3000/api/panel/events   # terminal 1
curl -X POST localhost:3000/api/bookings -H 'Content-Type: application/json' -d '{…}'  # terminal 2
# terminal 1 muestra: event: session / data: {"kind":"CREATED","actor":"GUARDIAN",…}
curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/panel/notifications   # unreadCount: 1
```
