# Spec: Reserva pública completa

## Objetivo

Reemplazar el mock MSW del apoderado (`public-parents-scheduling-web/src/mocks/`) por endpoints reales en esta API, reproduciendo **exactamente** el contrato público congelado: mismas rutas, mismas formas de respuesta, mismos mensajes de error en español, mismos códigos. Al cerrar esta spec, el apoderado puede completar todo su flujo (ver cupos, reservar, confirmar o cancelar por enlace, y opcionalmente crear/usar una cuenta) contra Postgres real, sin ningún mock.

Contexto: `../001-fundaciones-dominio/` dejó el dominio puro, Prisma y el manejo de errores. `../002-documentacion-swagger/` dejó `/api/docs` montado. Esta es la primera spec que expone endpoints de negocio y el primer uso real de `ZodValidationPipe`.

Fuente del contrato: `../../../public-parents-scheduling-web/src/mocks/{handlers,db}.ts` y `src/domain/types.ts`. Reglas de negocio: `../../../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`.

## Requisitos funcionales

### 1. Cupos (`GET /api/slots`)

- Query param `weekStart` (YYYY-MM-DD, se asume el lunes de una semana de calendario de Chile).
- Si falta `weekStart`: 400 `{ "error": "Falta weekStart" }`, **sin** `code`.
- Éxito 200: `{ "slots": SlotView[] }`, un `SlotView` por cada hora de la plantilla vigente (`TemplateSlot`) para cada día de lunes a sábado de esa semana, con `{ date, time, startsAt, available, past }`.
- Un cupo está libre (`available: true`) si:
  - no cae en un `DayBlock` de ese día ni en un `SlotBlock` de ese día+hora,
  - no tiene una `Session` con estado `PENDING` o `CONFIRMED` en ese `startsAt`,
  - no está en el pasado (`past: false`), y
  - la semana solicitada está dentro de `Preferences.bookingHorizonWeeks` desde la semana actual (más allá del horizonte, los cupos se listan igual pero con `available: false`; el contrato no tiene un campo separado para esto, así que se pliega en `available`).
- Un día completo bloqueado (`DayBlock`) no emite ningún `SlotView` para ese día (no solo los marca ocupados): equivalente a que la plantilla no tuviera horas ese día.

### 2. Reservar (`POST /api/bookings`)

Body (`CreateBookingInput`): `{ startsAt, guardianName, email, phone, childName, childAge, helpRequest?, createAccount?: { password } }`. `Authorization: Bearer <token>` opcional.

Éxito 201: `BookingResult = { session, guardian, child, auth? }` (`auth` presente solo si vino `createAccount`).

Orden de validación (debe reproducirse tal cual, porque determina qué error gana cuando aplican varios a la vez):

1. `childAge` fuera de 3–13 → 400 `INVALID_AGE`.
2. Falta algún campo obligatorio (`guardianName`, `email`, `phone`, `childName`, `childAge`; `helpRequest` queda fuera) → 400 `MISSING_FIELDS`.
3. Si hay sesión (`Bearer` válido) y su email de cuenta difiere del `email` del formulario → 400 `EMAIL_MISMATCH`.
4. Si viene `createAccount` y (ya hay sesión, o el email ya tiene cuenta) → 409 `ACCOUNT_EXISTS`.
5. Si viene `createAccount`, clave más corta que `PASSWORD_MIN_LENGTH` → 400 `WEAK_PASSWORD`.
6. `startsAt` en el pasado → 400 `PAST_SLOT`.
7. Cupo ya ocupado por una sesión `PENDING`/`CONFIRMED` → 409 `SLOT_TAKEN` (incluye la carrera de dos reservas simultáneas, resuelta por el índice único parcial de la BD).
8. `helpRequest` normalizado supera 500 caracteres → 400 `HELP_REQUEST_TOO_LONG`.

Reglas de escritura:

- Se reutiliza el `Guardian` existente por email normalizado; si no existe, se crea.
- `canUpdateProfile` = hay sesión del mismo apoderado, **o** el email todavía no tiene cuenta (`passwordHash` nulo). Si es `true`, se actualizan `name`/`phone` del guardian con los del formulario. Si es `false` (reserva anónima sobre un email que ya tiene cuenta), el perfil existente no se toca.
- Se reutiliza el `Child` existente por `[guardianId, normalizedName]`; si no existe, se crea. La edad se actualiza solo si `canUpdateProfile`.
- `helpRequest` se normaliza y se guarda en la `Session`, nunca en `Child`.
- Estado inicial vía `initialSessionStatus(startsAt, Preferences.confirmationDeadlineHours)`.
- `confirmToken`/`cancelToken` únicos, generados en el servidor.
- Si viene `createAccount`: se hashea la clave con argon2, se guarda en el `Guardian` y se arranca una sesión JWT (`auth: { token, profile }`).
- Se escribe una fila en `OutboxEmail` (`kind: 'BOOKING_PENDING'` o `'BOOKING_CONFIRMED'` según el estado inicial), sin despachar el envío. Ver "Fuera de alcance".

### 3. Consultar una reserva (`GET /api/bookings/:id`)

- Éxito 200: `BookingResult` sin `auth`.
- No existe: 404 `{ "error": "Reserva no encontrada" }`, **sin** `code`.
- Sin autenticación adicional: reproduce el mock tal cual (decisión confirmada — cambiarlo sería una spec de producto aparte).

### 4. Confirmar y cancelar (`POST /api/sessions/confirm/:token`, `POST /api/sessions/cancel/:token`)

Sin body. Éxito 200: `BookingResult`.

- Confirmar: token no encontrado → 404 `INVALID_TOKEN`. Sesión no `PENDING` (y no ya `CONFIRMED`) → 409 `NOT_PENDING`. Ya `CONFIRMED` → 200 idempotente, sin cambiar nada.
- Cancelar: token no encontrado → 404 `INVALID_TOKEN`. No se puede cancelar (`canCancelSession` es `false`, incluida la hora ya pasada) → 409 `CANCEL_NOT_ALLOWED`. Ya `CANCELLED` → 200 idempotente.
- Ambos escriben una fila en `OutboxEmail` (`CONFIRMED`/`CANCELLED`) solo cuando la transición fue real (no en el camino idempotente), sin despachar el envío.

### 5. Cuenta opcional del apoderado (`/api/auth/*`)

| Ruta | Body/Query | Éxito | Errores |
| --- | --- | --- | --- |
| `POST /register` | `{ email, password, guardianName, phone }` | 201 `AuthResult` | 400 `WEAK_PASSWORD` (se valida **antes** que campos faltantes), 400 `MISSING_FIELDS`, 409 `ACCOUNT_EXISTS` |
| `POST /login` | `{ email, password }` | 200 `AuthResult` | 401 `INVALID_CREDENTIALS` |
| `POST /logout` | Bearer opcional | 204 siempre | — |
| `GET /me` | Bearer | 200 `{ profile }` | 401 `NO_SESSION` |
| `GET /email-status` | `?email=` | 200 `{ hasAccount }` siempre | — |
| `POST /forgot` | `{ email }` | 200 `{ ok: true, devResetToken? }` siempre | — |
| `POST /reset` | `{ token, password }` | 200 `AuthResult` | 400 `INVALID_RESET`, 400 `WEAK_PASSWORD`, 404 `NO_ACCOUNT` |

- `register`: si el email ya tenía reservas sin cuenta, la cuenta se asocia a ese `Guardian` existente (no se duplica).
- `AuthResult = { token, profile: { guardian, children } }`.
- `forgot` nunca revela si el email tiene cuenta. `devResetToken` solo se incluye fuera de producción (mismo criterio de gating por `NODE_ENV` que `/api/docs`, spec 002); en producción la fila se escribe en `PasswordReset` pero el token no vuelve en la respuesta.
- `reset` invalida todos los `PasswordReset` y sesiones (`tokenVersion++`) del guardian al usarse.
- Un JWT deja de ser válido si su `tokenVersion` no coincide con el actual del `Guardian` (reset de clave, o un futuro "cerrar todas las sesiones").

## Fuera de alcance

- El job que pasa `PENDING` → `NOT_CONFIRMED` al vencer el plazo (spec siguiente: "vencimiento de confirmación con su job").
- El envío real de correos (Resend). Esta spec **sí** escribe filas en `OutboxEmail` en cada evento que las requiere (reserva, confirmar, cancelar), pero ningún proceso las despacha todavía.
- Series semanales: el apoderado público solo crea sesiones sueltas.
- Cualquier endpoint del panel de la educadora (`/api/panel/*`).
- Reprogramación por parte del apoderado, precios, WhatsApp automático (`../../../docs/mvp/FUERA_DEL_MVP.md`).
- Autenticación de la educadora (JWT separado, otra spec).

## Criterios de aceptación

- [x] `GET /api/slots` sin `weekStart` responde 400 `{ error: "Falta weekStart" }` sin `code`.
- [x] `GET /api/slots?weekStart=<lunes>` devuelve los `SlotView` de lunes a sábado según `TemplateSlot`, ninguno el domingo.
- [x] Un `DayBlock` en un día de la semana consultada hace que ese día no emita ningún `SlotView`.
- [x] Un `SlotBlock` puntual marca ese `SlotView` como `available: false` sin afectar los demás cupos del día.
- [x] Una semana más allá de `bookingHorizonWeeks` devuelve sus `SlotView` con `available: false` en todos.
- [x] Un cupo con una sesión `CANCELLED` o `NOT_CONFIRMED` en ese `startsAt` aparece `available: true` (el historial no bloquea).
- [x] `POST /api/bookings` válido crea `Guardian`/`Child`/`Session` en una sola transacción y responde 201 con `BookingResult`.
- [x] Reservar dos veces con el mismo email reutiliza el mismo `Guardian`, no lo duplica.
- [x] Reservar sobre un email con cuenta existente, sin `Bearer`, no modifica `name`/`phone`/edad guardados (pero sí crea la sesión).
- [x] Reservar con `Bearer` de la propia cuenta sí actualiza `name`/`phone`/edad.
- [x] `email` del formulario distinto al de la cuenta logueada responde 400 `EMAIL_MISMATCH` y no crea nada.
- [x] Dos reservas simultáneas sobre el mismo `startsAt` (dos requests concurrentes): una responde 201 y la otra 409 `SLOT_TAKEN`, nunca dos 201.
- [x] `createAccount` sobre un email que ya tiene cuenta responde 409 `ACCOUNT_EXISTS` y no crea la sesión ni toca la cuenta existente.
- [x] Una reserva cuyo `startsAt` cae dentro de `confirmationDeadlineHours` nace `CONFIRMED`; fuera del plazo nace `PENDING`.
- [x] Cada reserva exitosa deja exactamente una fila nueva en `OutboxEmail` con el `kind` correcto.
- [x] `GET /api/bookings/:id` de un id inexistente responde 404 `{ error: "Reserva no encontrada" }` sin `code`.
- [x] `POST /api/sessions/confirm/:token` con token inválido → 404 `INVALID_TOKEN`; sobre una sesión `NOT_CONFIRMED`/`CANCELLED` → 409 `NOT_PENDING`; sobre una ya `CONFIRMED` → 200 idempotente sin escribir `OutboxEmail` de nuevo.
- [x] `POST /api/sessions/cancel/:token` después de la hora de la cita → 409 `CANCEL_NOT_ALLOWED`; sobre una ya `CANCELLED` → 200 idempotente.
- [x] `POST /api/auth/register` con clave corta responde `WEAK_PASSWORD` incluso si además faltan otros campos (orden de validación).
- [x] `POST /api/auth/register` sobre un email que ya reservó sin cuenta asocia la cuenta nueva a ese `Guardian` (mismos `children` visibles luego en `GET /me`).
- [x] `POST /api/auth/login` con clave incorrecta responde 401 `INVALID_CREDENTIALS` sin distinguir "no existe" de "clave mala".
- [x] `POST /api/auth/logout` responde 204 con o sin `Bearer`, con token válido, vencido o ausente.
- [x] `GET /api/auth/me` sin `Bearer` o con uno inválido/vencido/de `tokenVersion` obsoleto responde 401 `NO_SESSION`.
- [x] `GET /api/auth/email-status` responde `{ hasAccount: true|false }` siempre con 200, nunca un error.
- [x] `POST /api/auth/forgot` responde 200 `{ ok: true }` tanto si el email existe como si no, sin filtrar la diferencia. `devResetToken` presente solo con `NODE_ENV !== 'production'`.
- [x] `POST /api/auth/reset` con un token usado o vencido responde 400 `INVALID_RESET`. Al resetear con éxito, un JWT emitido antes deja de servir en `GET /me` (401 `NO_SESSION`).
- [x] Todos los endpoints nuevos aparecen en `/api/docs` con `@ApiTags`/`@ApiOperation`/`@ApiResponse` por cada código de estado documentado en esta spec.
- [x] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.
