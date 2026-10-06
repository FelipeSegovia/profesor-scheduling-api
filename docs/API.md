# API — contrato HTTP

Fuente de la verdad para los frontends (`public-parents-scheduling-web/`,
`private-profesor-scheduling/`) y para cualquier lectura futura de este repo.
Hay dos archivos:

- **[`openapi.json`](./openapi.json)**: el esquema OpenAPI 3.0 exacto, generado
  desde el código (no escrito a mano). Es lo que hay que leer para tipos,
  parámetros y formas de respuesta exactas — por ejemplo con
  [`openapi-typescript`](https://openapi-ts.dev/) para generar tipos del lado
  del frontend, o importándolo en Postman/Insomnia.
- **Este archivo**: un resumen humano de alto nivel, para orientarse rápido
  sin parsear el JSON. No repite lo que ya dice el JSON (parámetros, schemas);
  para eso, `openapi.json`.

## Cómo regenerarlo

```bash
pnpm db:up            # Postgres tiene que estar arriba
pnpm docs:openapi      # nest build + vuelca /api/docs-json a openapi.json
```

Correr después de cualquier spec que agregue o cambie un endpoint (ver
`.specs/<NNN>-.../tasks.md`, tarea de "verificación de Swagger"). El comando
compila el proyecto de verdad (`nest build`) en vez de usar un transpilador
rápido tipo `tsx`/esbuild: estos no emiten los metadatos de decoradores que
Nest necesita para inyectar dependencias por tipo, y romperían la
instanciación de la app al generar el documento.

`openapi.json` es exactamente lo que sirve `GET /api/docs-json` con el
servidor corriendo fuera de producción (`NODE_ENV !== 'production'`) — mismo
título, versión y esquema, verificado byte a byte contra el servidor real. En
producción esa ruta no existe; este archivo es la única forma de consultar el
contrato sin levantar un entorno de desarrollo.

## Estado

Hay **45 rutas** documentadas (todas bajo el prefijo `/api`), de las specs
`001-fundaciones-dominio` (solo `/health`), `002-documentacion-swagger`
(Swagger montado), `003-reserva-publica` (el bloque del apoderado) y
`004-panel-educadora` (el bloque `/panel/*`) y `005-avisos-tiempo-real` (el stream
y las notificaciones del panel). `006-correos-resend` no agrega rutas: envía los
correos que ya disparaban los endpoints (ver "Correos"). `007-ficha-clinica`
agrega las cinco rutas de la ficha clínica por niño (ver "Ficha clínica").

### Apoderado y público

| Tag | Ruta | Método | Qué hace | Auth |
| --- | --- | --- | --- | --- |
| health | `/api/health` | GET | Prueba de vida de la API y de Postgres. | — |
| slots | `/api/slots` | GET | Cupos de lunes a sábado para la semana de `weekStart` (query, `YYYY-MM-DD`). | — |
| bookings | `/api/bookings` | POST | Reserva una sesión suelta. | `Bearer` opcional (autocompleta/actualiza el perfil si hay sesión). |
| bookings | `/api/bookings/{id}` | GET | Consulta una reserva por id. | — (mismo comportamiento que el mock que reemplaza: no valida quién pregunta). |
| sessions | `/api/sessions/confirm/{token}` | POST | Confirma una sesión pendiente. Idempotente. Avisa a la educadora por correo (ver "Correos"). | — (el token del correo es la autenticación). |
| sessions | `/api/sessions/cancel/{token}` | POST | Cancela una sesión. Idempotente. Ídem aviso a la educadora. | — (ídem). |
| auth | `/api/auth/register` | POST | Crea la cuenta opcional del apoderado. | — |
| auth | `/api/auth/login` | POST | Inicia sesión. | — |
| auth | `/api/auth/logout` | POST | Cierra sesión (siempre 204). | `Bearer` opcional. |
| auth | `/api/auth/me` | GET | Perfil de la cuenta con sesión activa. | `Bearer` **requerido**. |
| auth | `/api/auth/email-status` | GET | Si un correo (`?email=`) ya tiene cuenta. Nunca falla. | — |
| auth | `/api/auth/forgot` | POST | Pide un enlace de recuperación de clave. Siempre `{ ok: true }`. | — |
| auth | `/api/auth/reset` | POST | Restablece la clave con el token del correo. | — |

### Panel de la educadora (spec 004)

Todas bajo `/api/panel/*`, con un JWT propio (secreto `EDUCATOR_JWT_SECRET`,
distinto del apoderado — ver más abajo). Todas requieren `Bearer` salvo el
login.

| Tag | Ruta | Método | Qué hace |
| --- | --- | --- | --- |
| panel-auth | `/api/panel/auth/login` | POST | Inicia sesión como educadora. |
| panel-auth | `/api/panel/auth/logout` | POST | Cierra sesión (siempre 204). |
| panel-auth | `/api/panel/auth/me` | GET | Perfil de la educadora. |
| panel-auth | `/api/panel/auth/password` | POST | Cambia la clave; invalida el token anterior. |
| panel-summary | `/api/panel/summary` | GET | Resumen del día (`?date=`, hoy por defecto): métricas, sesiones del día, pendientes de confirmar, actividad reciente, próximo cupo libre. |
| panel-agenda | `/api/panel/agenda` | GET | Agenda de la semana (`?weekStart=`, lunes obligatorio): los 7 días con cada cupo resuelto a `FREE`/`BOOKED`/`BLOCKED_DAY`/`BLOCKED_SLOT`/`BEYOND_HORIZON`. |
| panel-schedule | `/api/panel/preferences` | GET | Plantilla semanal vigente (derivada de `TemplateSlot`) y los tres plazos configurables. |
| panel-schedule | `/api/panel/preferences` | PUT | Actualiza los tres plazos; rechaza si `seriesNoticeHours <= confirmationDeadlineHours`. |
| panel-schedule | `/api/panel/template` | PUT | Reemplaza la plantilla semanal completa. Nunca toca sesiones ya creadas. |
| panel-schedule | `/api/panel/blocks/day` | POST | Bloquea un día completo (solo si no tiene sesiones activas). |
| panel-schedule | `/api/panel/blocks/day/{date}` | DELETE | Desbloquea un día (204 aunque no estuviera bloqueado). |
| panel-schedule | `/api/panel/blocks/slot` | POST | Bloquea un cupo puntual (solo si está vacío). |
| panel-schedule | `/api/panel/blocks/slot/{date}/{time}` | DELETE | Desbloquea un cupo (204 aunque no estuviera bloqueado). |
| panel-sessions | `/api/panel/sessions` | POST | Crea una cita única (acepta horas fuera de la plantilla). |
| panel-sessions | `/api/panel/series` | POST | Crea una serie semanal; salta fechas ocupadas/bloqueadas/pasadas y las reporta en `skipped`. |
| panel-sessions | `/api/panel/sessions/{id}/move` | PATCH | Mueve una sesión a otro cupo; libera el anterior. |
| panel-sessions | `/api/panel/sessions/{id}/confirm` | POST | Marca `confirmada` a mano. |
| panel-sessions | `/api/panel/sessions/{id}/cancel` | POST | Cancela una sesión. |
| panel-people | `/api/panel/guardians` | GET | Lista apoderados (`?query=`), con conteo de niños y sesiones activas. |
| panel-people | `/api/panel/guardians/{id}` | GET | Ficha de un apoderado: sus niños (cada uno con `notesCount`, los registros de su ficha clínica) y el histórico completo de sesiones. |
| panel-people | `/api/panel/guardians` | POST | Crea una ficha de apoderado. |
| panel-people | `/api/panel/guardians/{id}` | PATCH | Actualiza nombre o teléfono. |
| panel-people | `/api/panel/guardians/{id}/children` | POST | Agrega un niño (sin el rango de edad 3–13 del formulario público). |
| panel-people | `/api/panel/children/{id}` | PATCH | Actualiza nombre o edad de un niño. |
| panel-clinical-notes | `/api/panel/children/{id}/notes` | GET | Registros de la ficha clínica de un niño, con el niño y su apoderado. |
| panel-clinical-notes | `/api/panel/children/{id}/notes` | POST | Agrega un registro; con `notifyGuardian: true` se envía por correo al apoderado. |
| panel-clinical-notes | `/api/panel/children/{id}/notes.pdf` | GET | Descarga en PDF el historial completo de la ficha. |
| panel-clinical-notes | `/api/panel/notes/{id}` | PATCH | Edita un registro. No reenvía el correo. |
| panel-clinical-notes | `/api/panel/notes/{id}` | DELETE | Borra un registro (204). |
| panel-events | `/api/panel/events` | GET | Stream `text/event-stream` (SSE) de cambios de sesiones; ver "Avisos en tiempo real". |
| panel-notifications | `/api/panel/notifications` | GET | Avisos de la campana (lo que hicieron apoderados o el sistema): hasta 20 ítems más el total de no leídos. |
| panel-notifications | `/api/panel/notifications/seen` | POST | Marca todos los avisos como vistos (204). |

## Avisos en tiempo real (spec 005)

Para enterarse sin recargar cuando un apoderado reserva, confirma o cancela.
Dos piezas, ambas bajo `/api/panel/*` y solo para la educadora:

### Stream: `GET /api/panel/events`

Server-Sent Events (`text/event-stream`). **No usar `EventSource`**: no permite
el header `Authorization`, y el token nunca debe ir en la URL. Abrirlo con
`fetch` y `Authorization: Bearer <jwt-educadora>`, y leer `response.body`. Sin
token o con un token de apoderado responde `401 NO_SESSION` en JSON, sin abrir
el stream.

Dos tipos de mensaje:

```
event: session
id: ckx…:CREATED
data: {"id":"ckx…:CREATED","kind":"CREATED","sessionId":"ckx…","childName":"Sofía","startsAt":"2026-10-05T22:00:00.000Z","actor":"GUARDIAN","at":"2026-10-01T18:30:00.000Z"}

event: ping
data: {}
```

- `kind`: `CREATED`, `CONFIRMED`, `CANCELLED`, `MOVED` (y `NOT_CONFIRMED`, que
  emitirá el job de vencimiento cuando exista).
- `actor`: `GUARDIAN` (reserva, confirma o cancela por los enlaces), `EDUCATOR`
  (lo hizo ella en el panel; sirve para refrescar otras pestañas, no para
  avisarle) o `SYSTEM`.
- `id` es `${sessionId}:${kind}`, pero **no es único en el tiempo**: `MOVED` puede
  repetirse para una sesión, así que no deduplicar por `id`. Tampoco es el `id` de
  los ítems de la campana (el alta de la campana usa `…:created`): para cruzar un
  evento con un ítem, comparar `sessionId` y `kind`.
- `ping` cada 25 s para que un proxy no corte la conexión ociosa.
- Un evento se manda solo después de que el cambio quedó guardado: una reserva
  que falla (`SLOT_TAKEN`) o una confirmación repetida no emiten nada.

Límites a tener en cuenta:

- **Sin reproducción**: se ignora `Last-Event-ID`. Lo ocurrido mientras no había
  conexión se pierde, así que al (re)conectar hay que volver a pedir resumen,
  agenda y notificaciones.
- El token se valida solo al abrir. Si vence o cambia la clave con el stream ya
  abierto, este sigue hasta cortarse; la reconexión recibe `401`.
- **Un solo proceso de la API**: los eventos viajan por un bus en memoria. Con
  más de una instancia haría falta Postgres `LISTEN/NOTIFY` o similar.

### Campana: `GET /api/panel/notifications` y `POST /api/panel/notifications/seen`

La campana se deriva de `Session` (no hay tabla de notificaciones): es la
actividad reciente **menos lo que hizo la propia educadora**.

```json
{
  "items": [
    { "id": "ckx…:CONFIRMED", "sessionId": "ckx…", "kind": "CONFIRMED",
      "childName": "Sofía", "startsAt": "2026-10-05T22:00:00.000Z",
      "actor": "GUARDIAN", "at": "2026-10-01T18:40:00.000Z", "unread": true }
  ],
  "unreadCount": 1
}
```

- `startsAt` (ISO) es el inicio de la **cita** afectada, no el momento del cambio (`at`): sirve
  para mostrar el cupo y ubicarla en la agenda. El mismo campo viene en cada ítem de `activity` de
  `GET /api/panel/summary` (campo agregado; no cambia ni quita nada de ese contrato).
- `unread` es verdadero si `at` es posterior a la última vez que se llamó a
  `POST /api/panel/notifications/seen` (o siempre, si nunca se llamó). Un ítem
  exactamente en esa marca cuenta como leído.
- `items` trae como máximo 20, más recientes primero; `unreadCount` cuenta toda
  la ventana (las 50 sesiones modificadas más recientemente), no solo los
  `items` devueltos.
- Cada sesión aporta su alta y solo su **último** cambio de estado, no el
  historial intermedio.

## Ficha clínica (spec 007)

Historial de lo que la educadora trabaja con cada niño: una lista de registros
fechados. Solo ella los ve en el panel; el apoderado únicamente recibe por
correo los que ella decide enviarle. Todas las rutas requieren el `Bearer` de la
educadora.

**`ClinicalNoteDto`**

```jsonc
{
  "id": "…",
  "childId": "…",
  "date": "2026-10-05",          // día del trabajo (YYYY-MM-DD, Chile), no un instante
  "title": "Trabajamos lectura",
  "body": "Practicó sílabas.",
  "sessionId": "…" | null,       // sesión de la agenda a la que corresponde
  "session": { "date": "2026-10-05", "time": "19:00", "status": "CONFIRMED" } | null,
  "guardianNotified": true,      // se pidió enviarlo al apoderado al crearlo
  "createdAt": "2026-10-03T12:00:00.000Z",
  "updatedAt": "2026-10-03T12:00:00.000Z"
}
```

- **`GET /api/panel/children/{id}/notes`** → `200 { child, guardian, notes }`.
  `child` y `guardian` tienen la forma de `GET /api/panel/guardians/{id}` (sin
  `notesCount`). `notes` va del más reciente al más antiguo (`date` y, a igual
  fecha, el último creado primero).
- **`POST /api/panel/children/{id}/notes`** → `201 ClinicalNoteDto`. Body:
  `{ date, title, body, sessionId?, notifyGuardian }`. `notifyGuardian` es
  **obligatorio** (booleano).
- **`PATCH /api/panel/notes/{id}`** → `200 ClinicalNoteDto`. Body: cualquier
  subconjunto de `{ date, title, body, sessionId }`; `sessionId: null`
  desvincula la sesión. No acepta `notifyGuardian` (si llega, se ignora): editar
  nunca manda un correo.
- **`DELETE /api/panel/notes/{id}`** → `204`. Es un borrado real. Si el correo
  del registro aún no había salido, no sale.
- **`GET /api/panel/children/{id}/notes.pdf`** → `200 application/pdf`, con
  `Content-Disposition: attachment; filename="ficha-<nombre>-<YYYY-MM-DD>.pdf"`
  (nombre sin tildes). Trae el encabezado del niño y su apoderado y **todos** los
  registros, del más antiguo al más reciente. Sin registros también responde
  200 (dice "Sin registros"). Hay que pedirlo con el header `Authorization`,
  así que desde el navegador se baja con `fetch` y un `Blob`, no con un enlace.
  La API expone `Content-Disposition` por CORS (`Access-Control-Expose-Headers`):
  sin eso, un navegador no deja leer el `filename` desde otro origen.

**Validación** (`400 VALIDATION_ERROR`): `title` entre 1 y 120 caracteres,
`body` entre 1 y 10.000 (ambos se recortan), `date` con formato `YYYY-MM-DD` y
un día que existe. Se aceptan fechas pasadas y futuras.

**Errores**

| Status | `code` | Cuándo |
| --- | --- | --- |
| 401 | `NO_SESSION` | Sin `Bearer` válido. |
| 404 | `CHILD_NOT_FOUND` | El niño no existe (`GET`/`POST` de `children/{id}/…`). |
| 404 | `NOTE_NOT_FOUND` | El registro no existe (`PATCH`/`DELETE`). |
| 422 | `NOTE_SESSION_MISMATCH` | El `sessionId` no existe o es de otro niño. |

Ninguna de estas rutas emite eventos de `GET /api/panel/events` ni avisos en la
campana: lo hace ella misma.

## Correos (spec 006)

Ningún endpoint cambia de forma ni de respuesta: los correos son un efecto
secundario. La mayoría se escriben en `OutboxEmail` en la misma transacción
que el cambio y salen después, en segundo plano (cada
`OUTBOX_POLL_INTERVAL_MS`, 15 s por defecto), así que **la respuesta HTTP no
espera al correo** y un fallo del proveedor nunca revierte la operación. Se
envían con Resend; sin `RESEND_API_KEY` se escriben en el log de la API.

| Endpoint | Correo al apoderado | Correo a la educadora |
| --- | --- | --- |
| `POST /api/bookings` | Reserva pendiente (Confirmo / No puedo) o ya confirmada (No puedo). | Solo si nace confirmada porque el plazo ya venció. |
| `POST /api/sessions/confirm/{token}` | Sesión confirmada (No puedo). | El apoderado confirmó. |
| `POST /api/sessions/cancel/{token}` | Sesión cancelada. | El apoderado canceló. |
| `POST /api/panel/sessions` | Igual que una reserva pública. | — |
| `POST /api/panel/series` | Igual que una reserva, solo para las sesiones que ya están dentro de la antelación de serie (`seriesNoticeHours`). | — |
| `PATCH /api/panel/sessions/{id}/move` | Cambio de horario; pide confirmar de nuevo si sigue pendiente. | — |
| `POST /api/panel/sessions/{id}/confirm` | Sesión confirmada. | — |
| `POST /api/panel/sessions/{id}/cancel` | Sesión cancelada. | — |
| `POST /api/panel/children/{id}/notes` | Solo si el body trae `notifyGuardian: true`: el registro completo (fecha, título y texto). Sin enlaces. | — |
| `POST /api/auth/forgot` | Enlace para restablecer la clave (solo si la cuenta existe). Sale directo, sin outbox. | — |

Enlaces que traen los correos, armados sobre `PUBLIC_WEB_URL` (rutas de
`public-parents-scheduling-web/`; en producción tiene que ser su URL pública con
`https`, o la API no arranca):

- Confirmo: `/sesion/{confirmToken}/confirmar` → `POST /api/sessions/confirm/{token}`.
- No puedo: `/sesion/{cancelToken}/cancelar` → `POST /api/sessions/cancel/{token}`.
- Restablecer clave: `/cuenta/restablecer/{token}` → `POST /api/auth/reset` (vence en 1 hora).

El contenido se arma con el estado de la sesión **al enviar**: si la cita ya
empezó, los correos al apoderado no se mandan, y tampoco los que invitan a
asistir de una sesión ya cancelada o vencida. La educadora nunca recibe correo
por lo que hace ella misma en el panel.

El correo de un registro de la ficha (`CLINICAL_NOTE`) también se arma **al
enviar**: si ella lo edita antes del despacho, sale el texto corregido, y si lo
borra antes, no sale (la fila queda `SKIPPED`). No depende de la fecha del
registro: uno de una fecha pasada se envía igual. Asunto: `Nuevo registro en la
ficha de <niño>`.

## Formato de error

Todas las respuestas de error tienen esta forma (`AllExceptionsFilter`,
`src/common/errors/exception.filter.ts`):

```json
{ "error": "Mensaje en español para mostrar al apoderado.", "code": "CODIGO_EN_INGLES" }
```

`code` está **ausente** (no `null`) en dos casos puntuales del contrato
congelado del apoderado: `GET /api/slots` sin `weekStart`, y
`GET /api/bookings/:id` con un id inexistente. El resto de los errores
siempre trae `code`.

Códigos del contrato congelado del apoderado (`.specs/003-reserva-publica/spec.md`):
`INVALID_AGE`, `MISSING_FIELDS`, `EMAIL_MISMATCH`, `ACCOUNT_EXISTS`,
`WEAK_PASSWORD`, `PAST_SLOT`, `SLOT_TAKEN`, `HELP_REQUEST_TOO_LONG`,
`INVALID_TOKEN`, `NOT_PENDING`, `CANCEL_NOT_ALLOWED`, `NO_SESSION`,
`NO_ACCOUNT`, `INVALID_RESET`, `INVALID_CREDENTIALS`, `VALIDATION_ERROR`,
`NOT_FOUND`, `INTERNAL_ERROR`.

Códigos propios del panel de la educadora (`.specs/004-panel-educadora/spec.md`,
no forman parte del contrato congelado — pueden cambiar sin previo aviso):
`SESSION_NOT_FOUND`, `GUARDIAN_NOT_FOUND`, `CHILD_NOT_FOUND`, `CHILD_EXISTS`,
`GUARDIAN_EXISTS`, `SLOT_BLOCKED`, `SLOT_NOT_EMPTY`, `INVALID_PREFERENCES`,
`INVALID_RANGE`, `SERIES_EMPTY` (además de reutilizar `SLOT_TAKEN`,
`PAST_SLOT`, `NOT_PENDING`, `CANCEL_NOT_ALLOWED`, `NO_SESSION`,
`INVALID_CREDENTIALS`, `WEAK_PASSWORD`, `MISSING_FIELDS`, `VALIDATION_ERROR`
del apoderado, con el mismo significado).

## Autenticación del apoderado

`Bearer <jwt>` en `Authorization`. El JWT no tiene refresh: expira según
`JWT_EXPIRES_IN` y hay que volver a iniciar sesión. Restablecer la clave
invalida cualquier JWT emitido antes (`GET /api/auth/me` con un token viejo
responde `401 NO_SESSION` después de un reset), aunque ese JWT todavía no
haya expirado por tiempo.

## Autenticación de la educadora

`Bearer <jwt>` en `Authorization`, igual formato que el del apoderado pero
**firmado con un secreto distinto** (`EDUCATOR_JWT_SECRET`, no `JWT_SECRET`):
un token de una superficie nunca decodifica ni sirve en la otra. Expira según
`EDUCATOR_JWT_EXPIRES_IN`. Cambiar la clave (`POST /api/panel/auth/password`)
invalida cualquier token emitido antes, igual mecanismo (`Educator.tokenVersion`)
que el del apoderado. No hay flujo de recuperación de clave por correo: al ser
usuaria única, la recuperación es operativa (`pnpm db:seed` con
`SEED_EDUCATOR_PASSWORD` nuevo).

## Qué no hay todavía

- El job que vence las sesiones `PENDING` → `NOT_CONFIRMED` al cumplirse el
  plazo, con su correo de liberación, y los correos de cada sesión de una serie
  al llegar la antelación configurada (hoy solo salen los de las sesiones que
  ya estaban dentro de esa ventana al crear la serie).
- Rate limiting en `POST /api/panel/auth/login`.
- Que el apoderado vea la ficha clínica en la web pública o desde su cuenta
  (solo recibe por correo los registros que la educadora le envía), reenviar el
  correo de un registro, adjuntos y historial de versiones de un registro.

Detalle de reglas de negocio y de qué endpoint viene de qué spec:
[`../.specs/003-reserva-publica/spec.md`](../.specs/003-reserva-publica/spec.md),
[`../.specs/004-panel-educadora/spec.md`](../.specs/004-panel-educadora/spec.md),
[`../.specs/007-ficha-clinica/spec.md`](../.specs/007-ficha-clinica/spec.md),
[`../CLAUDE.md`](../CLAUDE.md).
