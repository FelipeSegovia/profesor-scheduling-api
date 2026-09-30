# Spec: Fundaciones y modelo de dominio

## Objetivo

Dejar la API en condiciones de recibir features de negocio: base de datos con el modelo completo del MVP, reglas de dominio puras con tests, configuración por entorno y un formato de error uniforme.

Esta spec **no expone ningún endpoint de negocio**. Termina con un `GET /api/health` que responde y una base de datos sembrada con la plantilla inicial de la educadora. Los cupos, la reserva y el panel llegan en las specs siguientes.

Contexto y decisiones de arquitectura: `~/.claude/plans/crea-un-plan-para-mighty-kazoo.md`. Reglas de negocio: `../../../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`.

## Requisitos funcionales

### 1. Persistencia

- Postgres vía `docker-compose.yml` para desarrollo local.
- Prisma con el esquema completo del MVP. Identificadores en inglés; comentarios `///` en español.

| Modelo | Campos |
| --- | --- |
| `Educator` | `id`, `email` (único), `name`, `passwordHash`, `tokenVersion` |
| `Guardian` | `id`, `name`, `email` (único), `phone`, `passwordHash?`, `tokenVersion` |
| `Child` | `id`, `guardianId`, `name`, `normalizedName`, `age` — único por `[guardianId, normalizedName]` |
| `Session` | `id`, `childId`, `guardianId`, `startsAt`, `status`, `confirmToken` (único), `cancelToken` (único), `helpRequest?`, `seriesId?`, `createdBy`, `noticeSentAt?` |
| `Series` | `id`, `childId`, `guardianId`, `weekday`, `time`, `startDate`, `endDate` |
| `TemplateSlot` | `id`, `weekday`, `time` — único por `[weekday, time]` |
| `DayBlock` | `id`, `date` (único) |
| `SlotBlock` | `id`, `date`, `time` — único por `[date, time]` |
| `Preferences` | singleton: `confirmationDeadlineHours` (24), `seriesNoticeHours` (48), `bookingHorizonWeeks` (8) |
| `PasswordReset` | `id`, `guardianId`, `tokenHash` (único), `expiresAt`, `usedAt?` |
| `OutboxEmail` | `id`, `sessionId?`, `kind`, `recipient`, `status`, `attempts`, `error?` |

- `enum SessionStatus`: `PENDING`, `CONFIRMED`, `NOT_CONFIRMED`, `CANCELLED`.
- `enum Actor`: `GUARDIAN`, `EDUCATOR`, `SYSTEM`.
- `Session.startsAt` es `timestamptz` en UTC. La conversión a `America/Santiago` es responsabilidad del dominio, nunca de la BD.
- `TemplateSlot.time` y `SlotBlock.time` son `HH:mm`. `DayBlock.date`, `SlotBlock.date` y las fechas de `Series` son columnas de fecha (`DateTime @db.Date`), interpretadas siempre como día de calendario chileno.
- **Índice único parcial** que impide reservar dos veces el mismo cupo. Prisma no lo genera, va como SQL crudo en la migración inicial:
  ```sql
  CREATE UNIQUE INDEX session_active_slot ON "Session"("startsAt")
    WHERE status IN ('PENDING','CONFIRMED');
  ```

### 2. Dominio puro (`src/domain/`)

Sin dependencias de Nest. El enum `SessionStatus` viene del cliente generado de Prisma, así que `prisma generate` corre antes de los tests. El resto se porta desde `../../../public-parents-scheduling-web/src/domain/booking.ts` y `auth.ts`:

`normalizeName`, `normalizeEmail`, `normalizeHelpRequest`, `HELP_REQUEST_MAX_LENGTH`, `isValidChildAge`, `PASSWORD_MIN_LENGTH`, `slotStartsAtIso`, `weekMondayYmd`, `weekDaysMonSatYmd`, `isSlotOccupied`, `confirmationDeadlinePassed`, `initialSessionStatus`, `canCancelSession`, `isPastSlot`.

Dos cambios respecto del original:

- `confirmationDeadlinePassed` e `initialSessionStatus` reciben las horas de plazo como parámetro obligatorio. Se elimina el `hoursBefore = 24` por defecto: ese valor vive en `Preferences`.
- `initialSessionStatus` devuelve `SessionStatus`, no literales en español.

No se porta `timesForWeekday`: las horas pasan a salir de `TemplateSlot`.

### 3. Mapa de estados del contrato público

Un único módulo traduce `SessionStatus` a los literales que transporta el contrato público congelado, y de vuelta:

`PENDING` ↔ `"pendiente"` · `CONFIRMED` ↔ `"confirmada"` · `NOT_CONFIRMED` ↔ `"no_confirmada"` · `CANCELLED` ↔ `"cancelada"`

Es la única traducción de idioma en el código. Ningún otro lugar emite esos literales.

### 4. Configuración

- `@nestjs/config` global, con el esquema de variables validado por Zod al arrancar. Si falta o es inválida una variable, el proceso no levanta.
- Variables: `DATABASE_URL`, `PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REDIRECT_TO`, `PUBLIC_WEB_URL`, `CORS_ORIGINS`.
- `.env.example` con todas ellas documentadas en español.

### 5. Errores y validación

- `ZodValidationPipe` para los cuerpos y query params.
- Filtro global de excepciones que emite **exactamente** el formato del mock: `{ "error": "<mensaje en español>", "code": "<CODIGO_EN_INGLES>" }` con el status correspondiente.
- Una excepción de dominio `DomainError(message, status, code)` que el filtro traduce a esa forma, equivalente al `httpError()` de `db.ts`.
- Los códigos ya definidos por el contrato congelado se declaran como constantes desde ya: `INVALID_AGE`, `MISSING_FIELDS`, `EMAIL_MISMATCH`, `ACCOUNT_EXISTS`, `WEAK_PASSWORD`, `PAST_SLOT`, `SLOT_TAKEN`, `HELP_REQUEST_TOO_LONG`, `INVALID_TOKEN`, `NOT_PENDING`, `CANCEL_NOT_ALLOWED`, `NO_SESSION`, `NO_ACCOUNT`, `INVALID_RESET`.

### 6. Semilla

`prisma/seed.ts` deja la base utilizable y es idempotente:

- La educadora, con correo y clave desde variables de entorno (clave hasheada con argon2, nunca en texto plano en el repo).
- `Preferences` con 24 / 48 / 8.
- La plantilla inicial del doc canónico: lunes a viernes `19:00` y `20:00`; sábado `09:00`, `10:00` y `11:00`. **Son 3 cupos el sábado**, no 4: el `WORK_WEEK` del panel privado dice `09:00–13:00` y está equivocado frente a `REQUERIMIENTOS_FUNCIONALES.md`.

### 7. Limpieza del scaffold

- `GET /api/health` devuelve `{ status: 'ok' }` y verifica que la BD responde.
- Prefijo global `/api`, CORS por `CORS_ORIGINS`.
- Se eliminan `src/app.controller.*` y `src/app.service.*` con su `Hello World!`.
- Las credenciales placeholder `'YOUR_APP_KEY'` / `'YOUR_APP_SECRET'` de `@nestjs/observe` salen de `app.module.ts`: o se leen de env, o se quita el módulo.

## Fuera de alcance

- Cualquier endpoint de negocio: cupos, reservas, confirmar, cancelar, cuentas y panel. Van en las specs 002 a 007.
- El envío real de correos. Aquí solo existe la tabla `OutboxEmail`; el adaptador de Resend llega en 002.
- Los jobs programados. Llegan en 003.
- Tocar `public-parents-scheduling-web` o `private-profesor-scheduling`.
- Despliegue, CI y dominio verificado de correo.

## Criterios de aceptación

- [x] `docker compose up -d db && pnpm prisma migrate dev` crea la base desde cero sin errores.
- [x] La migración inicial contiene el índice `session_active_slot`, y un `INSERT` directo de una segunda sesión `PENDING` con el mismo `startsAt` falla a nivel de base de datos.
- [x] Dos sesiones `CANCELLED` o `NOT_CONFIRMED` sobre el mismo `startsAt` **sí** se permiten: el histórico no bloquea el cupo.
- [x] `pnpm prisma db seed` es idempotente: correrlo dos veces deja 13 `TemplateSlot` (5 días × 2 + 3 del sábado), una `Educator` y una fila de `Preferences`.
- [x] `pnpm test` pasa e incluye, en `src/domain/`: rango de edad 3–13 (con 2 y 14 rechazados), normalización de nombre y correo, límite de 500 caracteres de la nota, `initialSessionStatus` con plazo vigente y vencido usando horas inyectadas, `canCancelSession` antes y después de la hora de la cita, y el cálculo de `startsAt` **cruzando un cambio de horario de Chile** (para que un cupo de las 19:00 siga siendo las 19:00 locales en ambos lados del cambio).
- [x] Un test verifica el mapa de `SessionStatus` en ambas direcciones para los cuatro valores, y agregar un estado al enum sin darle literal rompe la compilación.
- [x] Guardar un `DayBlock` del `2026-10-05` y volver a leerlo devuelve `2026-10-05` con el proceso corriendo en `TZ=America/Santiago` **y** en `TZ=UTC`. Es la prueba de que la columna `date` no corre el día.
- [x] Arrancar sin `DATABASE_URL` o sin `JWT_SECRET` falla al inicio con un mensaje claro, no en la primera petición.
- [x] `pnpm test:e2e` pasa: `GET /api/health` devuelve 200, y una ruta inexistente devuelve el formato `{ error, code }` y no el HTML por defecto de Nest.
- [x] `pnpm lint` y `pnpm build` pasan. Todo import relativo lleva extensión `.js`.
- [x] No queda ningún `Hello World!` ni credencial placeholder en `src/`.
