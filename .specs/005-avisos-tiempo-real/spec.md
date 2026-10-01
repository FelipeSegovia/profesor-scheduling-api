# Spec: Avisos en tiempo real al panel de la educadora

## Objetivo

Que el panel de la educadora (`private-profesor-scheduling/`), mientras está abierto, se
entere al instante cuando una sesión se crea o cambia de estado —en particular cuando un
apoderado reserva, confirma o cancela desde `public-parents-scheduling-web/`— y que lo no
visto quede marcado en la campana aunque el panel haya estado cerrado.

Contexto y decisiones de arquitectura: `~/.claude/plans/crea-un-plan-para-kind-octopus.md`.
Hoy la educadora no recibe correo por reservas nuevas (regla canónica,
`../../../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md` §Correos: "eso se ve al abrir la agenda") y
los correos de confirmar/cancelar quedan en `OutboxEmail` sin despachar (no existe el job).

Decisiones tomadas con el usuario:

- **Transporte: Server-Sent Events** (`@Sse` de Nest, sin dependencias nuevas), autenticado
  con el mismo `Bearer` de la educadora en el header — nunca un token en la URL.
- **Persistencia derivada de `Session`**, sin tabla de notificaciones (mismo criterio que "sin
  tabla de auditoría" de la 004): la campana reutiliza `deriveActivity` y "no leído" se
  calcula contra una marca de tiempo nueva en `Educator`.

Esta spec agrega una regla de negocio (aviso dentro del panel, no correo). **No cambia**
ninguna regla de correo ni el contrato congelado del apoderado (`/api/auth`, `/api/bookings`,
`/api/sessions`, `/api/slots`): mismas rutas, mismas respuestas, mismos errores.

## Requisitos funcionales

### 1. Eventos de sesión en proceso

- Módulo nuevo `src/events/` (`EventsModule`, `@Global()`), con `SessionEventsService`:
  `emit(event: SessionEvent)` y `stream(): Observable<SessionEvent>` sobre un `Subject` de
  rxjs.
- Forma del evento (código en inglés):
  ```ts
  type SessionEventKind = 'CREATED' | 'CONFIRMED' | 'CANCELLED' | 'NOT_CONFIRMED' | 'MOVED';
  interface SessionEvent {
    id: string;          // `${sessionId}:${kind}`; MOVED puede repetirse. No es el id de ActivityItem
    kind: SessionEventKind;
    sessionId: string;
    childName: string;
    startsAt: string;    // ISO
    actor: Actor;        // GUARDIAN | EDUCATOR | SYSTEM
    at: string;          // ISO, momento del cambio
  }
  ```
- **Se emite solo después de que la transacción hace commit.** Una reserva que falla (por
  ejemplo `SLOT_TAKEN` por el índice `session_active_slot`) no emite nada.
- Puntos de emisión:
  - `BookingsService.createBooking` → `CREATED`, actor `GUARDIAN`.
  - `BookingsService.confirmByToken` → `CONFIRMED`, actor `GUARDIAN`.
  - `BookingsService.cancelByToken` → `CANCELLED`, actor `GUARDIAN`.
  - Las ramas idempotentes de confirmar/cancelar (sesión ya en ese estado) **no** emiten.
  - `PanelSessionsService`: cita única y cada sesión creada de una serie → `CREATED`; mover →
    `MOVED`; marcar confirmada → `CONFIRMED`; cancelar → `CANCELLED`. Todos con actor
    `EDUCATOR` (sirven para sincronizar otras pestañas; el panel no muestra aviso por ellos).
- El job futuro de vencimiento (siguiente spec) emitirá `NOT_CONFIRMED` con actor `SYSTEM`
  usando este mismo servicio. Esta spec solo deja el tipo previsto.
- Limitación asumida: un solo proceso de la API. Con más de una instancia el bus en memoria no
  alcanza (habría que pasar a Postgres `LISTEN/NOTIFY`); queda fuera de alcance y documentado.

### 2. Stream SSE del panel

- `GET /api/panel/events` (`src/panel/events/`), `text/event-stream`.
- Exige sesión de educadora (`EducatorAuthGuard` por `@UseGuards`, nunca `APP_GUARD`).
  Sin token o con token de apoderado → 401 `{ error, code: 'NO_SESSION' }` antes de abrir el
  stream.
- Mensajes:
  - `event: session`, `id: <SessionEvent.id>`, `data: <SessionEvent JSON>` por cada cambio.
  - `event: ping`, `data: {}` cada 25 s, para que proxies no corten la conexión ociosa.
- El token se valida al abrir. Si después vence o cambia `tokenVersion`, el stream sigue
  abierto hasta que se corte; la reconexión del cliente recibe 401. Se acepta así.
- No hay reproducción de eventos perdidos (`Last-Event-ID` se ignora): al reconectar, el
  cliente vuelve a pedir resumen, agenda y notificaciones.
- Documentado con `@ApiTags`/`@ApiOperation`/`@ApiResponse`
  (`test/swagger-coverage.e2e-spec.ts`).

### 3. Notificaciones de la campana

- Migración: `Educator.notificationsSeenAt DateTime?` (null = nunca abrió la campana).
- Dominio puro `src/domain/notifications.ts`:
  `deriveNotifications(activity: ActivityItem[], seenAt: Date | null)` → descarta los ítems con
  `actor === 'EDUCATOR'`, marca `unread: true` si `seenAt` es null o `at > seenAt`, y devuelve
  `{ items, unreadCount }`.
- La consulta de sesiones recientes que hoy vive inline en `PanelDashboardService.getSummary`
  se extrae a un helper compartido, reutilizado por el resumen y por las notificaciones (el
  resultado de `GET /api/panel/summary` no cambia).
- `GET /api/panel/notifications` → `200 { items: NotificationItem[], unreadCount: number }`,
  con `NotificationItem = ActivityItem & { unread: boolean }`, más recientes primero, máximo
  20.
- `POST /api/panel/notifications/seen` → `204`, fija `notificationsSeenAt = now()`.
- Ambas exigen sesión de educadora (401 `NO_SESSION`).
- Limitación heredada de `deriveActivity`: cada sesión aporta su alta y solo su último cambio
  de estado.

### 4. Documentación

- `docs/API.md` (sección del stream: formato, ping, reconexión, limitación de un proceso) y
  `docs/openapi.json` regenerado con `pnpm docs:openapi`.
- `CLAUDE.md` de esta app: tabla de endpoints del panel y nota del bus en memoria.
- `../../../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`: sección nueva "Avisos en el panel" y
  ajuste de "Eso se ve al abrir la agenda". `../../../AGENTS_PRIVATE.md` y
  `../../../CLAUDE.md` (hoja de ruta).

## Fuera de alcance

- Interfaz del panel (conexión al stream, toasts, campana): spec propia en
  `private-profesor-scheduling/.specs/005-avisos-tiempo-real/`, después de esta.
- Tabla de notificaciones, marcar leída de a una, historial completo de transiciones.
- Varias instancias de la API (`LISTEN/NOTIFY`, Redis).
- Notificaciones push del navegador o del sistema operativo, y cualquier aviso al apoderado.
- El job de vencimiento y el despacho de `OutboxEmail` (siguiente spec).
- Cambios en `public-parents-scheduling-web/`.

## Criterios de aceptación

- [x] Con el stream abierto con token de educadora, `POST /api/bookings` exitoso produce un
      `event: session` con `kind: 'CREATED'`, `actor: 'GUARDIAN'` y el `sessionId` creado.
- [x] `POST /api/sessions/confirm/:token` y `/cancel/:token` producen `CONFIRMED` / `CANCELLED`
      con actor `GUARDIAN`; repetirlos (idempotente) no produce un segundo evento.
- [x] Una reserva rechazada con `SLOT_TAKEN` no produce evento.
- [x] Las acciones de `/api/panel/sessions*` producen eventos con actor `EDUCATOR`.
- [x] `GET /api/panel/events` sin token o con token de apoderado responde 401 `NO_SESSION`.
- [x] `GET /api/panel/notifications`: `unreadCount` sube con una reserva pública, no con una
      cita creada desde el panel, y vuelve a 0 tras `POST /api/panel/notifications/seen`.
- [x] `GET /api/panel/summary` devuelve lo mismo que antes del refactor (sus e2e pasan sin
      cambios).
- [x] Los e2e del contrato del apoderado pasan sin modificarse.
- [x] `test/swagger-coverage.e2e-spec.ts` en verde; `docs/openapi.json` regenerado.
- [x] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` en verde.
