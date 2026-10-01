# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend del agendamiento de la educadora diferencial. La spec [`001-fundaciones-dominio`](.specs/001-fundaciones-dominio/) dejó la base lista: Postgres + Prisma, dominio puro, configuración validada y manejo de errores uniforme. La spec [`002-documentacion-swagger`](.specs/002-documentacion-swagger/) (completada) agregó documentación interactiva en `/api/docs`. La spec [`003-reserva-publica`](.specs/003-reserva-publica/) (completada) agregó los primeros endpoints de negocio: cupos, reserva, confirmar/cancelar y la cuenta opcional del apoderado — ver la tabla de endpoints abajo. La spec [`004-panel-educadora`](.specs/004-panel-educadora/) (completada) agrega el panel de la educadora completo: autenticación propia, resumen, agenda, preferencias, plantilla, bloqueos, series y fichas bajo `/api/panel/*`. La spec [`005-avisos-tiempo-real`](.specs/005-avisos-tiempo-real/) (completada) agrega los avisos en vivo al panel: stream SSE y campana de notificaciones. Mapa general del proyecto en [`../CLAUDE.md`](../CLAUDE.md).

### Endpoints (desde la spec 003)

| Ruta | Módulo | Notas |
| --- | --- | --- |
| `GET /api/slots?weekStart=` | `src/slots/` | Cupos de lunes a sábado; `weekStart` se valida a mano (mensaje sin `code`). |
| `POST /api/bookings` | `src/bookings/` | Reserva una sesión suelta; `Bearer` opcional para autocompletar/actualizar el perfil. |
| `GET /api/bookings/:id` | `src/bookings/` | Sin autenticación, igual al contrato del mock congelado. |
| `POST /api/sessions/confirm/:token` | `src/bookings/` (`sessions.controller.ts`) | Idempotente. |
| `POST /api/sessions/cancel/:token` | `src/bookings/` (`sessions.controller.ts`) | Idempotente. |
| `POST /api/auth/register`, `/login`, `/logout`, `/reset`, `/forgot` | `src/auth/` | Cuenta opcional del apoderado; JWT propio (ver abajo), sin Passport. |
| `GET /api/auth/me` | `src/auth/` | Requiere `Bearer` válido (`GuardianAuthGuard`). |
| `GET /api/auth/email-status?email=` | `src/auth/` | Nunca falla. |

### Endpoints del panel (desde la spec 004, `/api/panel/*`)

| Ruta | Módulo | Notas |
| --- | --- | --- |
| `POST /api/panel/auth/login`, `/logout`, `GET /me`, `POST /password` | `src/panel/auth/` | JWT propio (`EDUCATOR_JWT_SECRET`, distinto del apoderado). Sin recuperación de clave por correo. |
| `GET /api/panel/summary?date=` | `src/panel/dashboard/` | Métricas, sesiones del día, pendientes, actividad (derivada de `Session`, sin tabla de auditoría), próximo cupo libre. |
| `GET /api/panel/agenda?weekStart=` | `src/panel/agenda/` | 7 días con cada cupo resuelto (`FREE`/`BOOKED`/`BLOCKED_DAY`/`BLOCKED_SLOT`/`BEYOND_HORIZON`) vía `SlotsService.buildWeekGrid`. |
| `GET/PUT /api/panel/preferences`, `PUT /template`, `POST`/`DELETE /blocks/day(/:date)`, `POST`/`DELETE /blocks/slot(/:date/:time)` | `src/panel/schedule/` | Editar plantilla nunca toca sesiones existentes; bloquear exige el cupo vacío. |
| `POST /api/panel/sessions`, `/series`, `PATCH /sessions/:id/move`, `POST /sessions/:id/confirm`, `/cancel` | `src/panel/sessions/` | La educadora puede agendar fuera de la plantilla vigente. Series filtra fechas antes de escribir y reporta `skipped`. |
| `GET/POST /api/panel/guardians`, `PATCH /guardians/:id`, `POST /guardians/:id/children`, `PATCH /children/:id` | `src/panel/people/` | Edad sin el rango 3–13 del formulario público. |
| `GET /api/panel/events` | `src/panel/events/` | Stream SSE (`text/event-stream`) de cambios de sesiones; `Bearer` en header, no `EventSource`. Ping cada 25 s. Ver abajo "Avisos en tiempo real". |
| `GET /api/panel/notifications`, `POST /notifications/seen` | `src/panel/notifications/` | Campana derivada de `Session` (sin tabla): hasta 20 avisos y `unreadCount` contra `Educator.notificationsSeenAt`. |

Ningún endpoint del panel escribe `OutboxEmail` dirigido a la educadora salvo
`confirmByToken`/`cancelByToken` (`src/bookings/`): la regla canónica es que
ella no recibe correo por lo que hace ella misma en su agenda. El job que
despacha `OutboxEmail` y vence las sesiones `PENDING` sigue sin existir.

**Contrato para los frontends**: [`docs/API.md`](docs/API.md) (resumen) y [`docs/openapi.json`](docs/openapi.json) (esquema OpenAPI exacto, generado con `pnpm docs:openapi`; ver ese comando en `package.json` y el porqué de compilar con `nest build` en vez de `tsx` en `src/scripts/export-openapi.ts`). Regenerar después de cualquier spec que cambie un endpoint.

## Su lugar en el proyecto

`../` contiene tres apps independientes, cada una con su propio `.git` y `package.json`; no comparten código. Las dos del frontend ([`private-profesor-scheduling/`](../private-profesor-scheduling/) y [`public-parents-scheduling-web/`](../public-parents-scheduling-web/)) funcionan hoy contra MSW en memoria — todavía no están conectadas a esta API. Esta es la que debe reemplazar esos mocks, así que **los handlers MSW existentes son el contrato de partida**, no una referencia opcional:

- `../public-parents-scheduling-web/src/mocks/db.ts` — reglas de negocio ya implementadas en el mock público (cupos libres, estado inicial según el plazo, reutilizar apoderado por email y niño por nombre, tokens de confirmar/cancelar, cuenta opcional y reset de clave). Es el borrador más completo de lo que va aquí, y el contrato público **se congela**: mismas rutas, mismas formas de respuesta, mismos mensajes de error en español.
- `../public-parents-scheduling-web/src/mocks/handlers.ts` — rutas y formas de respuesta que el apoderado ya consume (`/api/slots`, `/api/bookings`, `/api/sessions/confirm/:token`, `/api/auth/*`).
- `../private-profesor-scheduling/src/mocks/` — mock de solo lectura del panel. Su contrato **no** se hereda: son datos de presentación, no de dominio. El panel se rediseña bajo `/api/panel/*`.

Los tipos de dominio de las dos apps **difieren entre sí** (por ejemplo `SessionStatus` en el panel privado solo tiene `pendiente | confirmada`, y su plantilla de sábado da 4 cupos en vez de 3). Unificarlos es trabajo de esta API: al definir una entidad o un estado, la fuente es `../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`, no el tipo que ya exista en un frontend.

Jerarquía de fuentes (igual que en la raíz): `../docs/mvp/` gana sobre `../AGENTS_PRIVATE.md` / `../AGENTS_PUBLIC.md`, que ganan sobre este archivo. Si cambias una regla de negocio, actualiza `../docs/mvp/` y los `AGENTS*.md` afectados en el mismo cambio.

Producto y documentación en español. **El código va en inglés** (identificadores, campos, tablas, rutas, códigos de error); español queda para comentarios de clases/métodos, mensajes de cara al usuario y documentación — ver `.specs/001-fundaciones-dominio/plan.md`. Zona horaria `America/Santiago` (el MVP asume una sola zona; no hay soporte multi-tz).

## Comandos

```bash
pnpm install                    # postinstall corre `prisma generate`
cp .env.example .env            # variables de entorno (ver la tabla ahí)
pnpm db:up                      # docker compose up -d db — Postgres 17, puerto 5433
pnpm db:migrate                 # prisma migrate dev (Prisma 7 NO regenera el cliente: correr `pnpm prisma generate` después)
pnpm db:seed                    # prisma db seed — idempotente

pnpm start:dev                  # nest start --watch (PORT o 3000)
pnpm build                      # nest build (borra dist antes)
pnpm start:prod                 # node dist/main
pnpm lint                       # oxlint --type-aware src/ test/
pnpm format                     # prettier --write

pnpm test                       # vitest run — solo **/*.spec.ts (dominio, sin BD)
pnpm test:watch
pnpm test:cov
pnpm test:e2e                   # NODE_ENV=test, contra .env.test y una base separada
```

`pretest`/`postinstall` corren `prisma generate` solos; no hace falta acordarse.

Un solo test o un caso puntual (los dos configs son independientes, `pnpm test` nunca corre los e2e):

```bash
pnpm vitest run src/domain/booking.spec.ts
pnpm vitest run -t 'confirmationDeadlinePassed'
pnpm vitest run --config ./vitest.config.e2e.ts test/health.e2e-spec.ts
```

## Arquitectura y convenciones

NestJS 12 + TypeScript 6 + Prisma 7 + Vitest 4 + oxlint. Node 24, pnpm.

- **ESM real** (`"type": "module"`, `module: nodenext`): todo import relativo lleva extensión `.js` aunque el archivo sea `.ts`. Omitirla rompe en runtime, no en `tsc`. Excepción real, no teórica: `prisma/seed.ts` se corre con `tsx` (ver `prisma.config.ts`), no con `node` puro — Node despoja tipos pero no remapea `.js`→`.ts`, y el cliente de Prisma generado usa imports `.js` internos.
- **Prisma 7**: `datasource.url` ya no va en `schema.prisma` (ni con `env(...)`); vive en `prisma.config.ts`, junto con la ruta del seed. El cliente (`src/generated/prisma/`, gitignored) exige un driver adapter — `PrismaService` arma el suyo (`@prisma/adapter-pg`) desde `DATABASE_URL` vía `ConfigService`. El CLI de Prisma **no autocarga `.env`**: `prisma.config.ts` lo hace a mano con `dotenv`, con un valor de relleno para que `generate` no rompa un `pnpm install` en un clon recién bajado sin `.env` todavía.
- **`src/domain/`**: reglas de negocio puras, sin Nest ni conexión a BD. Portadas de `public-parents-scheduling-web/src/domain/`, con el dominio del apoderado. `SessionStatus` se importa del cliente generado (no se redeclara); `session-status.ts` tiene el único mapa de traducción al español del contrato público congelado.
- **Errores**: `DomainError` + `AllExceptionsFilter` normalizan todo a `{ error, code }` (sin `code` cuando el contrato original no lo trae). Los mensajes de `src/common/errors/messages.ts` son copia textual del mock: cambiar una palabra cambia lo que ve el apoderado.
- **Config**: `@nestjs/config` con validación Zod (`src/config/env.ts`). Falta una variable → el proceso no arranca, no falla en la primera petición.
- **Tests**: unitarios (`**/*.spec.ts`, junto al código) sin BD ni Nest. E2e (`**/*.e2e-spec.ts`, en `test/`) contra Postgres real en una base separada (`.env.test`, `agendamientos_test`); `test/helpers/global-setup.ts` la crea y migra sola, `test/helpers/db.ts` la trunca entre casos.
- **Lint**: `oxlint --type-aware`; `typescript/no-floating-promises` es error, `typescript/no-explicit-any` está apagado. `src/generated/` está excluido de lint y de prettier.
- **`@nestjs/observe`** solo se monta si `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` están en el entorno (`app.module.ts`). Sin ellas, no aparece en el árbol de módulos — evita el 401 en bucle del scaffold original con credenciales de ejemplo.
- **Swagger**: `GET /api/docs` (UI) y `GET /api/docs-json` (esquema OpenAPI), montados en `main.ts` solo si `NODE_ENV !== 'production'` — en producción la ruta no existe (404 `{error, code:'NOT_FOUND'}` del filtro global, no la UI). Los esquemas se infieren por análisis estático de los tipos TypeScript planos vía el plugin `@nestjs/swagger` registrado en `nest-cli.json` (no se usan clases con `@ApiProperty` ni `class-validator`). Cada controlador nuevo debe llevar `@ApiTags`/`@ApiOperation`/`@ApiResponse`, siguiendo el patrón de `src/health/health.controller.ts`. `test/swagger-coverage.e2e-spec.ts` falla si una ruta de negocio pierde su tag/summary.
- **JWT del apoderado** (spec 003): `@nestjs/jwt`, sin Passport. Payload `{ sub: guardianId, tokenVersion }`. `GuardianContextMiddleware` (`src/auth/`) decodifica un `Bearer` opcional sin lanzar nunca; `GuardianAuthGuard` exige sesión solo en `GET /api/auth/me`. Invalidar sesiones es incrementar `Guardian.tokenVersion` (reset de clave), no una tabla de sesiones. Password hashing con `argon2` (igual que la educadora); el token de reset de clave se hashea con SHA-256 simple (`src/common/tokens/random-token.ts`) porque ya es aleatorio de alta entropía.
- **JWT de la educadora** (spec 004): `src/panel/auth/`, patrón calcado del apoderado pero con `JwtModule` y secreto propios (`EDUCATOR_JWT_SECRET`) — nunca compartido con `AuthModule`. Payload `{ sub: educatorId, tokenVersion, role: 'educator' }`. `EducatorContextMiddleware` nunca lanza (igual que `GuardianContextMiddleware`), pero `EducatorAuthGuard` se aplica con `@UseGuards` en cada controlador/ruta del panel salvo `login` — **no** como `APP_GUARD`: ese token de Nest aplicaría el guard a toda la app, incluidas las rutas del apoderado. Sin flujo de "olvidé mi clave"; recuperación operativa vía `pnpm db:seed`.
- **Avisos en tiempo real** (spec 005): `src/events/` (`EventsModule`, `@Global()`) tiene `SessionEventsService`, un bus en memoria (`Subject` de rxjs) con `emit`/`stream`. `BookingsService` (apoderado) y `PanelSessionsService` (educadora) emiten **después del commit** de la transacción, nunca dentro: una reserva que revierte por `SLOT_TAKEN` no avisa, y las ramas idempotentes de confirmar/cancelar tampoco. `GET /api/panel/events` (`@Sse`, `EducatorAuthGuard`) lo expone como SSE. **Un solo proceso**: con varias instancias haría falta Postgres `LISTEN/NOTIFY`. La campana (`src/panel/notifications/`) no usa el bus: deriva de `Session` con `loadRecentActivity` (`src/panel/activity.query.ts`, compartido con el resumen) y `deriveNotifications` (`src/domain/notifications.ts`). El `id` del evento (`…:CREATED`) no coincide con el de `ActivityItem` (`…:created`). El job de vencimiento futuro debe emitir `NOT_CONFIRMED` con actor `SYSTEM`.
- **Carrera de doble reserva**: el índice único parcial `session_active_slot` (SQL crudo, spec 001) es la única fuente de verdad; `src/common/prisma/prisma-errors.ts` traduce el `P2002` que dispara a `409 SLOT_TAKEN` dentro de la transacción de `BookingsService.createBooking` y `PanelSessionsService`. El nombre del índice viaja en `meta.driverAdapterError.cause.constraint.index` con `@prisma/adapter-pg@7.10.0` (no en `meta.target`, que es el shape de un `P2002` de Prisma sin driver adapter) — `isSlotTakenViolation` comprueba ambas formas.
- **`DomainError.code` es `string`**, no el enum cerrado `ErrorCodeValue`: ese enum sigue documentando el contrato congelado del apoderado (`ErrorCode` en `domain-error.ts`), pero el panel tiene sus propios códigos en `src/common/errors/panel-messages.ts` (`PanelErrorMessage`), con un contrato que no está congelado.
- **`vitest.config.e2e.ts`** corre con `fileParallelism: false`: todos los archivos e2e comparten una sola base Postgres y corren `TRUNCATE` en `beforeEach`; en paralelo eso produce deadlocks reales de Postgres entre archivos. La suite completa (~140 tests) tarda ~50s en serie; un timeout puntual de 5s en un test aislado suele ser carga del sistema, no un fallo real — repetir antes de investigar.

## Flujo SDD

Las features que tocan varias capas se trabajan en `.specs/<NNN>-<nombre>/`, con numeración propia. `001-fundaciones-dominio`, `002-documentacion-swagger` y `003-reserva-publica` están completadas; `004-panel-educadora` está completada; `005-avisos-tiempo-real` está completada. Plantillas en [`../.specs/_templates/`](../.specs/_templates/) (`spec.md`, `plan.md`, `tasks.md`, `status.md`). Reglas: no escribir código sin `spec.md` aprobado, pedir aprobación entre fases, seguir `tasks.md` en orden y mantener `status.md` al día.

Orden acordado con el usuario, revisado al abrir la 004 (detalle en
`.specs/004-panel-educadora/plan.md`): el panel de la educadora se adelantó a esta spec,
antes del job de vencimiento de confirmación — series semanales ya van incluidas en la 004
(cita única y serie comparten spec). Después de la 004 sigue el job de vencimiento con su
`OutboxEmail` (`PENDING` → `NOT_CONFIRMED`).

## Qué no implementar

Fuera del MVP (detalle en [`../docs/mvp/FUERA_DEL_MVP.md`](../docs/mvp/FUERA_DEL_MVP.md)): precio, resumen de ingresos, WebPay o boleta; WhatsApp automático; reprogramación por parte del apoderado; duraciones distintas de 1 hora o más de una profesional.

Invariante transversal: **ningún endpoint público puede devolver datos de otra familia.** La superficie del apoderado solo ve fecha y hora de los cupos libres, y cada correo habla solo de su propia cita.
