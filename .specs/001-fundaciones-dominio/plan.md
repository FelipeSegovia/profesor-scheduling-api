# Plan: Fundaciones y modelo de dominio

Diseño técnico de [`spec.md`](./spec.md). Contexto general de las siete specs del backend: `~/.claude/plans/crea-un-plan-para-mighty-kazoo.md`.

## Hallazgos del scaffold (verificados, no supuestos)

Cuatro cosas comprobadas contra el repo antes de escribir este plan, porque cambian decisiones:

1. **Vitest 4 sí emite metadata de decoradores.** `pnpm test` y `pnpm test:e2e` pasan hoy con `AppController` inyectando `AppService` por tipo. No hace falta `unplugin-swc` ni `@swc/core`, que es la receta habitual para Nest + Vitest. No agregarlos.
2. **`npm view prisma version` devuelve `8.0.0-rc.19`.** El tag `latest` apunta a un release candidate. `pnpm add prisma` sin versión instalaría la RC. Se fija **`7.10.0`** (el tag `prev`, que es la estable).
3. **Node 24 despoja tipos, pero no remapea extensiones.** Comprobado corriendo un `.ts` con tipos directamente: eso funciona. Lo que NO funciona es que ese `.ts` importe al cliente generado de Prisma — sus imports internos usan extensión `.js` (`./enums.js`, etc.), y Node nativo exige que ese archivo exista literalmente; no lo remapea a `.ts` como sí hacen Vite (en los tests) y `tsc` (en `nest build`). Confirmado también instalando: `node prisma/seed.ts` falla con `ERR_MODULE_NOT_FOUND` en cuanto el seed importa `PrismaClient`. La solución, sin añadir mucho: `tsx` como devDependency, y el seed se registra como `tsx prisma/seed.ts` en `prisma.config.ts` (no en `package.json`: el CLI de Prisma 7 lee `migrations.seed` de ahí).
4. **Vitest avisa que `vite-tsconfig-paths` ya es innecesario** (Vite resuelve los paths de tsconfig de forma nativa con `resolve.tsconfigPaths`). Limpieza opcional de una línea en los dos configs.

## Archivos a tocar

**Nuevos**

```
docker-compose.yml
.env.example
.env                                  (git-ignored)
prisma.config.ts                      datasource.url + seed para el CLI de Prisma
prisma/schema.prisma
prisma/migrations/<ts>_init/migration.sql
prisma/seed.ts
src/prisma/prisma.module.ts
src/prisma/prisma.service.ts
src/config/env.ts                     esquema Zod de variables
src/config/config.module.ts
src/common/errors/domain-error.ts     DomainError + códigos
src/common/errors/messages.ts         mensajes en español, textuales del mock
src/common/errors/exception.filter.ts
src/common/validation/zod.pipe.ts
src/domain/time.ts                    + time.spec.ts
src/domain/booking.ts                 + booking.spec.ts
src/domain/auth.ts                    + auth.spec.ts
src/domain/session-status.ts          + session-status.spec.ts
src/health/health.controller.ts
src/health/health.module.ts
test/helpers/db.ts                    truncado entre casos
test/helpers/global-setup.ts          migrate deploy sobre la BD de test
test/health.e2e-spec.ts
```

**Modificados**

- `src/app.module.ts` — importa Config, Prisma y Health; saca las credenciales `'YOUR_APP_KEY'` de `@nestjs/observe` a variables de entorno y desactiva el módulo si no están.
- `src/main.ts` — prefijo global `/api`, CORS por `CORS_ORIGINS`, filtro global de excepciones, `app.enableShutdownHooks()`.
- `package.json` — dependencias, `prisma.seed`, hooks `postinstall` y `pretest` con `prisma generate`, scripts `db:up`, `db:migrate`, `db:seed`, `test:e2e` con `.env.test`.
- `vitest.config.e2e.ts` — `globalSetup` para preparar la BD de test.
- `.oxlintrc.json` / `.prettierrc` — ignorar `src/generated/`.
- `.gitignore` — `.env`, `src/generated/`.
- `README.md` — reemplazar el del starter de NestJS por el de esta API.
- `CLAUDE.md` — deja de ser «scaffold limpio».

**Eliminados**

`src/app.controller.ts`, `src/app.controller.spec.ts`, `src/app.service.ts`, `test/app.e2e-spec.ts` (asserta `Hello World!`).

## Diseño

### 1. Postgres y Prisma

`docker-compose.yml` con `postgres:17-alpine`, puerto `5433` en el host para no chocar con un Postgres local, volumen con nombre y healthcheck.

Dependencias fijadas: `prisma@7.10.0`, `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`.

```prisma
generator client {
  provider     = "prisma-client"        // generador ESM, no el legacy prisma-client-js
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}
```

El código generado se importa **con extensión `.js`**, igual que el resto del proyecto ESM.

`PrismaService extends PrismaClient implements OnModuleInit`, construido con el adaptador `PrismaPg` sobre `DATABASE_URL`, y `$connect()` en `onModuleInit`. `PrismaModule` es `@Global()` para no reimportarlo en cada feature.

**Confirmado instalando y probando contra Postgres real** (tarea 1 de `tasks.md`, ya ejecutada): en Prisma 7 el `datasource.url` **ya no existe en `schema.prisma`**, ni siquiera con `env(...)` — falla la validación pidiendo moverlo a `prisma.config.ts`. Y el driver adapter es obligatorio en el cliente: el tipo generado lo marca `adapter: runtime.SqlDriverAdapterFactory` (no opcional) salvo que se use Prisma Accelerate.

Por eso hace falta un archivo nuevo, `prisma.config.ts`, que no estaba en el plan original:

```ts
// prisma.config.ts
import { config as loadDotenv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

loadDotenv()   // ver hallazgo abajo: el CLI de Prisma 7 no carga .env solo

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },   // lo usan migrate/introspect/studio
  migrations: { seed: 'tsx prisma/seed.ts' },  // ver hallazgo 3: node solo no basta
})
```

**Segundo hallazgo, confirmado también instalando y probando**: a diferencia de versiones anteriores de Prisma, el CLI de la 7 **no autocarga `.env`**. Internamente usa `c12` con `dotenv: false` para leer `prisma.config.ts`, y sin ese archivo cargando dotenv por su cuenta, cualquier `pnpm prisma migrate/seed/generate` falla con `Cannot resolve environment variable: DATABASE_URL` a menos que alguien exporte las variables a mano en la shell antes. La solución es la línea `loadDotenv()` de arriba: como `prisma.config.ts` es un módulo JS/TS normal que el CLI simplemente ejecuta, cargar dotenv como primera línea del archivo resuelve `process.env.DATABASE_URL` antes de que `env('DATABASE_URL')` lo lea, sin necesitar wrappers en los scripts de `package.json`. Verificado: `pnpm prisma db seed` sin sourcing previo funciona y el seed ve tanto `DATABASE_URL` como el resto de las variables de `.env`.

`prisma migrate dev`, `db seed`, etc. leen la URL de ahí. El *runtime* del cliente (`PrismaService`) es independiente: construye su propia `PrismaPg({ connectionString: ... })` desde la misma variable de entorno vía `ConfigService`, y se la pasa a `new PrismaClient({ adapter })`. Verificado de punta a punta: `pnpm prisma migrate dev` contra un Postgres real crea la migración y la aplica, `nest build` compila el cliente generado sin fricción, y `node dist/main.js` sirve una petición que escribe una fila real a través de `PrismaClient` + `PrismaPg`.

Un detalle de resolución de módulos que también quedó probado: el generador solo emite `.ts` (no hay paso de compilación propio), y esos archivos se importan entre sí con extensión `.js`, igual que el resto del proyecto ESM. Bajo Vitest eso resuelve solo (Vite mapea `.js` a la fuente `.ts`). Bajo `nest build` también, porque `tsc` compila el cliente generado junto con el resto y emite los `.js` reales en `dist/`. Lo único que **no** funciona es ejecutar un `.ts` generado con `node` puro fuera de esos dos caminos — no es una ruta que el proyecto use, así que no es un problema real.

**Esquema.** Tal cual la tabla de la spec. Notas de tipos:

- `Session.startsAt`: `DateTime @db.Timestamptz(3)`. Siempre UTC.
- `TemplateSlot.time`, `SlotBlock.time`, `Series.time`: `String @db.VarChar(5)` en formato `HH:mm`.
- `DayBlock.date`, `SlotBlock.date`, `Series.startDate`, `Series.endDate`: `DateTime @db.Date`, es decir el tipo `date` de Postgres. Son días de calendario chileno, no instantes, y `date` es la columna temporal que no lleva desfase: no hay conversión de zona al leer ni al escribir, así que un bloqueo no se puede correr un día.
  **Convención obligatoria, porque el tipo solo no basta:** al construir el `Date` de JavaScript que va a una de estas columnas se usa siempre medianoche UTC (`new Date(Date.UTC(y, m - 1, d))`). Si se pasa un `Date` construido en hora local, Postgres trunca al día UTC y en Chile (UTC-3/-4) eso cae en el día anterior. El helper `chileDateToColumn` / `columnToChileDate` de `src/domain/time.ts` encapsula las dos direcciones y es el único lugar autorizado para hacer esa conversión.
- `Preferences`: singleton con `id Int @id @default(1)` y un check de que `id = 1`.
- Índices además de los únicos de la spec: `Session(startsAt)`, `Session(status)`, `Session(seriesId)`, `OutboxEmail(status)`.
- `onDelete`: `Child` → `Guardian` en cascada; `Session` → `Child`/`Guardian` con `Restrict`, porque las sesiones canceladas son historial y no se borran.

**El índice único parcial.** Prisma no lo modela, así que:

```bash
pnpm prisma migrate dev --create-only --name init
# editar prisma/migrations/<ts>_init/migration.sql, agregar al final:
#   CREATE UNIQUE INDEX session_active_slot ON "Session"("startsAt")
#     WHERE status IN ('PENDING','CONFIRMED');
pnpm prisma migrate dev
```

Queda un comentario en `schema.prisma` sobre el modelo `Session` avisando que ese índice vive en el SQL de la migración y no en el esquema, porque es invisible desde aquí y es la garantía de que un cupo no se reserva dos veces.

### 2. Dominio puro

`src/domain/` no importa Nest. Del cliente generado de Prisma toma únicamente el enum `SessionStatus`. Por lo demás se apoya solo en `date-fns` y `date-fns-tz`, igual que los frontends, para que la lógica sea idéntica a la que ya se probó en el navegador.

| Archivo | Contenido |
| --- | --- |
| `time.ts` | `TIMEZONE`, `slotStartsAtIso`, `toChileDateString`, `weekMondayYmd`, `weekDaysMonSatYmd`, `isPastSlot`, `chileDateToColumn`, `columnToChileDate` |
| `booking.ts` | `normalizeName`, `normalizeHelpRequest`, `HELP_REQUEST_MAX_LENGTH`, `isValidChildAge`, `isSlotOccupied`, `confirmationDeadlinePassed`, `initialSessionStatus`, `canCancelSession` |
| `auth.ts` | `normalizeEmail`, `PASSWORD_MIN_LENGTH` |
| `session-status.ts` | el mapa de `SessionStatus` al contrato público |

Se portan desde `../../../public-parents-scheduling-web/src/domain/`. Dos cambios obligatorios, ya fijados en la spec: las horas de plazo se inyectan (se borra el `hoursBefore = 24`) e `initialSessionStatus` devuelve `SessionStatus`.

**Origen del enum:** `SessionStatus` se importa del cliente generado de Prisma; el dominio no lo redeclara. El esquema es la única fuente del estado, y no hay dos definiciones que puedan separarse.

La consecuencia operativa es que **`prisma generate` tiene que haber corrido antes de compilar o testear**. Se automatiza en `package.json` con `postinstall` y `pretest` (`prisma generate`), de modo que un clon limpio o un `pnpm test` en frío no fallen con un import inexistente. El `satisfies Record<SessionStatus, string>` del mapa de la sección 3 pasa a ser la red que detecta un estado nuevo en el esquema sin traducción al contrato público: agregar un valor al enum rompe la compilación hasta que se le dé su literal.

### 3. Mapa de estados

```ts
export const STATUS_TO_WIRE = {
  PENDING: 'pendiente',
  CONFIRMED: 'confirmada',
  NOT_CONFIRMED: 'no_confirmada',
  CANCELLED: 'cancelada',
} as const satisfies Record<SessionStatus, string>
```

Más su inverso, derivado del primero en vez de escrito a mano, para que no puedan discrepar. Es la única traducción de idioma del sistema, y solo la usa la capa pública.

### 4. Configuración

`src/config/env.ts` exporta un esquema Zod; `ConfigModule.forRoot({ isGlobal: true, validate })` lo aplica al arrancar, de modo que una variable ausente rompe el arranque y no la primera petición.

| Variable | En 001 | Nota |
| --- | --- | --- |
| `DATABASE_URL` | requerida | |
| `NODE_ENV` | `development` por defecto | `development \| test \| production` |
| `PORT` | `3000` por defecto | |
| `JWT_SECRET` | requerida, mínimo 32 caracteres | la usan 004 y 005 |
| `JWT_EXPIRES_IN` | `7d` por defecto | |
| `CORS_ORIGINS` | lista separada por comas | los dos frontends de Vite |
| `PUBLIC_WEB_URL` | requerida | base de los enlaces Confirmo / No puedo |
| `SEED_EDUCATOR_EMAIL` / `SEED_EDUCATOR_PASSWORD` | solo las lee el seed | |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REDIRECT_TO` | **opcionales en 001** | pasan a requeridas en 002, cuando exista el adaptador |
| `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` | opcionales | sin ellas, no se monta `ObserveModule` |

Dejar las tres de correo opcionales ahora evita que nadie pueda levantar la API sin una cuenta de Resend antes de que haya un solo endpoint que mande correo.

### 5. Errores y validación

`DomainError(message, status, code)` reproduce el `httpError()` de `db.ts`. Los códigos son constantes en `domain-error.ts` y los mensajes viven en `messages.ts`, **copiados textualmente** del mock: la app pública los muestra en pantalla, así que cambiar una palabra es cambiar la interfaz.

`AllExceptionsFilter` global normaliza todo a `{ error, code }`:

- `DomainError` → su status, mensaje y código.
- `ZodError` → 400 con `VALIDATION_ERROR`.
- `HttpException` de Nest (404 de ruta desconocida, etc.) → su status con `NOT_FOUND` / `INTERNAL_ERROR`.
- Cualquier otra → 500 genérico, con el detalle al log y **nunca** al cliente.

Detalle del contrato congelado que hay que respetar: dos respuestas públicas del mock traen `error` **sin** `code` (`Reserva no encontrada` y `Falta weekStart`). El filtro omite la clave cuando no hay código, en vez de emitir `code: null`.

`ZodValidationPipe` valida cuerpos y query params y delega el formateo al filtro.

### 6. Semilla

`prisma/seed.ts`, registrado en `prisma.config.ts` (`migrations.seed: 'tsx prisma/seed.ts'`) — Node 24 solo no alcanza porque el cliente generado de Prisma usa imports `.js` internos que Node no remapea a `.ts` (ver hallazgo 3).

Idempotente con `upsert` en los tres casos:

- `Educator` por `email`, con la clave hasheada con **argon2**. Nunca una clave en texto plano en el repo ni en el historial de git. Si el módulo nativo diera problemas al instalar, la alternativa sin dependencias es `scrypt` de `node:crypto`.
- `Preferences` id 1 con 24 / 48 / 8.
- `TemplateSlot`: **13 filas** — lunes a viernes `19:00` y `20:00` (10), sábado `09:00`, `10:00`, `11:00` (3). El sábado son 3, no 4: el `WORK_WEEK` del panel privado (`09:00–13:00`) contradice el doc canónico y el doc canónico manda.

El seed no crea apoderados, niños ni sesiones de ejemplo: los datos de prueba llegan con los endpoints que los usan, en 002.

### 7. Limpieza del scaffold

`main.ts` pasa a tener prefijo `/api`, CORS por lista, filtro global y `enableShutdownHooks()` para que Prisma cierre bien. `app.module.ts` monta `ObserveModule` **solo si** hay credenciales en el entorno, con lo que desaparecen los literales `'YOUR_APP_KEY'`.

`GET /api/health` hace `SELECT 1` contra Postgres y devuelve `{ status: 'ok' }`, o 503 si la BD no responde. Es lo que prueba que el cableado quedó bien.

### 8. Estrategia de tests

**Unitarios** (`pnpm test`): solo dominio, sin base de datos ni Nest. El hook `pretest` corre `prisma generate` para que el enum importado exista. Tiempo controlado con `vi.useFakeTimers()` / `vi.setSystemTime()`, nunca `new Date()` real, para que no fallen según la hora a la que se corran.

El test de cambio de horario se escribe **autoverificable**, sin fechas de transición hardcodeadas: para un cupo de las `19:00` en una fecha de verano y otra de invierno chileno, se afirma que (a) ambos vuelven a formatearse como `19:00` en `America/Santiago` y (b) sus horas UTC difieren. Así el test demuestra que el desfase existe y que el dominio lo absorbe, sin depender de que yo acierte la fecha exacta del cambio.

**e2e** (`pnpm test:e2e`): contra un Postgres real, base `agendamientos_test` separada, con `.env.test`. `globalSetup` corre `prisma migrate deploy` una vez; un helper trunca todas las tablas entre casos. Sin mocks de base de datos: el índice único parcial es precisamente lo que hay que probar de verdad, y un mock no lo tiene.

## Dependencias a agregar

Producción: `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, `@nestjs/config`, `zod`, `argon2`, `date-fns`, `date-fns-tz`.
Desarrollo: `prisma@7.10.0`, `dotenv` (carga `.env`/`.env.test` donde Nest todavía no corrió — `prisma.config.ts` y `test/helpers/global-setup.ts`), `tsx` (para que `prisma/seed.ts` pueda importar el cliente generado, hallazgo 3), `pg` + `@types/pg` (crear/truncar la base de test en el arnés de e2e).

No se agregan `unplugin-swc` ni `@swc/core` (hallazgo 1). No se agregan `@nestjs/jwt`, `@nestjs/schedule`, `@nestjs/throttler` ni `resend`: entran en las specs que los usan.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `pnpm add prisma` instala la RC 8.0.0 | Fijar `7.10.0` exacto en los tres paquetes |
| ~~La API de driver adapters de Prisma 7 no es como la supongo~~ | **Resuelto.** Confirmado con Postgres real: adapter obligatorio, `datasource.url` fuera del schema, todo documentado arriba. Riesgo cerrado. |
| `oxlint --type-aware` recorre el cliente generado y se vuelve lento o ruidoso | Ignorar `src/generated/` en `.oxlintrc.json` y `.prettierrc` |
| El módulo nativo de argon2 no compila | Cambiar a `scrypt` de `node:crypto`, sin dependencias |
| Un `Date` local escrito en una columna `@db.Date` cae un día antes en Chile | Toda conversión pasa por `chileDateToColumn` / `columnToChileDate`; test unitario del viaje de ida y vuelta |
| Compilar o testear sin haber corrido `prisma generate` | Hooks `postinstall` y `pretest` en `package.json` |
| Los e2e dejan datos entre casos y se contaminan | Truncado explícito en `beforeEach`, no `afterEach` |

## Verificación end-to-end

```bash
pnpm install                     # postinstall corre prisma generate
docker compose up -d db
cp .env.example .env
pnpm prisma migrate dev          # crea la BD desde cero
pnpm prisma db seed
pnpm prisma db seed              # dos veces: debe seguir en 13 TemplateSlot
pnpm test                        # dominio (pretest regenera el cliente)
pnpm test:e2e                    # health + formato de error, contra Postgres real
pnpm lint && pnpm build
pnpm start:dev
curl -s localhost:3000/api/health          # {"status":"ok"}
curl -s localhost:3000/api/no-existe       # {"error":"...","code":"NOT_FOUND"}, no HTML
```

El índice parcial se comprueba a mano, que es donde de verdad se gana o se pierde:

```sql
-- misma hora, dos sesiones activas: la segunda debe fallar
INSERT INTO "Session" (...) VALUES (..., '2026-10-05 22:00:00+00', 'PENDING');
INSERT INTO "Session" (...) VALUES (..., '2026-10-05 22:00:00+00', 'CONFIRMED');  -- ERROR

-- misma hora, dos sesiones de historial: ambas deben entrar
INSERT INTO "Session" (...) VALUES (..., '2026-10-05 22:00:00+00', 'CANCELLED');
INSERT INTO "Session" (...) VALUES (..., '2026-10-05 22:00:00+00', 'NOT_CONFIRMED');  -- OK
```

Y que el arranque falle temprano:

```bash
DATABASE_URL= pnpm start        # debe morir con mensaje claro, no en la primera petición
```

Cierra la spec cuando los diez criterios de aceptación de [`spec.md`](./spec.md) están marcados.
