# Tasks: Fundaciones y modelo de dominio

Orden de ejecución de [`plan.md`](./plan.md). Se siguen en orden; cada una deja el repo en verde (`pnpm lint && pnpm build`). Actualizar [`status.md`](./status.md) al cerrar cada tarea.

## Infraestructura

1. [x] **Instalar dependencias con versión fija y comprobar la API de Prisma 7.** — hecho.
   `pnpm add @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 @nestjs/config zod argon2 date-fns date-fns-tz` y `pnpm add -D prisma@7.10.0`. Se aprobaron los scripts nativos de `argon2` y `prisma`/`@prisma/engines` (`pnpm approve-builds`), quedaron registrados en `pnpm-workspace.yaml`.
   **Confirmado, no solo instalado**: `pnpm why prisma` da 7.10.0 exacto (el tag `latest` de npm es `8.0.0-rc.19`, evitado). Se generó un cliente de prueba contra un Postgres 17 real en Docker, se corrió `prisma migrate dev`, y se hizo un `nest build` + `node dist/main.js` end-to-end escribiendo una fila real. Resultado: el driver adapter **es obligatorio** y `datasource.url` **ya no va en `schema.prisma`**, ni con `env()` — el detalle completo y el `prisma.config.ts` resultante quedaron documentados en `plan.md`. Todo el andamiaje de prueba (contenedor, archivos temporales) se limpió; `src/` y `app.module.ts` quedaron exactamente como el scaffold original.

2. [x] **`docker-compose.yml` con Postgres 17.**
   Puerto `5433` en el host para no chocar con un Postgres local, volumen con nombre, healthcheck.
   Verificación: `docker compose up -d db && docker compose ps` muestra el contenedor `healthy`.

3. [x] **`.env.example`, `.env`, `.gitignore` y `prisma.config.ts`.**
   `prisma.config.ts` con `datasource.url` desde `env('DATABASE_URL')` y `migrations.seed`, tal como quedó verificado en la tarea 1. Sin este archivo, `prisma migrate dev` falla su validación.
   Todas las variables de la tabla del plan, documentadas en español. `RESEND_API_KEY`, `EMAIL_FROM` y `EMAIL_REDIRECT_TO` quedan comentadas: son opcionales hasta la spec 002.
   Agregar `.env`, `.env.test` y `src/generated/` a `.gitignore`.
   Verificación: `git status` no lista `.env`.

## Base de datos

4. [x] **`prisma/schema.prisma` completo.**
   Los once modelos y los dos enums de la spec, con el generador `prisma-client` (ESM) hacia `src/generated/prisma`. Comentarios `///` en español en cada modelo y en los campos no obvios.
   Las fechas de calendario (`DayBlock.date`, `SlotBlock.date`, `Series.startDate`, `Series.endDate`) van como `DateTime @db.Date`. `Session.startsAt` va como `@db.Timestamptz(3)`.
   Dejar un comentario sobre `Session` avisando que el índice único parcial vive en el SQL de la migración y no se ve desde aquí.
   Verificación: `pnpm prisma validate` y `pnpm prisma generate` pasan.

5. [x] **Migración inicial con el índice único parcial.**
   `pnpm prisma migrate dev --create-only --name init`, editar el SQL generado agregando:
   ```sql
   CREATE UNIQUE INDEX session_active_slot ON "Session"("startsAt")
     WHERE status IN ('PENDING','CONFIRMED');
   ```
   y aplicar con `pnpm prisma migrate dev`.
   Verificación: `\d "Session"` en psql lista `session_active_slot`. Dos `INSERT` activos en el mismo `startsAt` fallan; dos `CANCELLED` en el mismo `startsAt` entran.
   Cierra los criterios de aceptación 1, 2 y 3.

6. [x] **`PrismaModule` y `PrismaService`.**
   `@Global()`, `PrismaService extends PrismaClient implements OnModuleInit` con `$connect()`, construido según lo confirmado en la tarea 1.
   Verificación: la app arranca y `GET /api/health` funcionará en la tarea 14.

## Configuración y errores

7. [x] **`src/config/env.ts` y `ConfigModule`.** (implementada junto con la 6, porque `PrismaService` depende de `ConfigService` para no dejar código que no compila)
   Esquema Zod de todas las variables, `ConfigModule.forRoot({ isGlobal: true, validate })`. `JWT_SECRET` con mínimo 32 caracteres.
   Verificación: `DATABASE_URL= pnpm start` muere al arrancar con un mensaje que nombra la variable faltante, no en la primera petición. Cierra el criterio 7.

8. [x] **`DomainError`, códigos y mensajes.**
   `src/common/errors/domain-error.ts` con la clase y las constantes de código; `messages.ts` con los mensajes **copiados textualmente** de `public-parents-scheduling-web/src/mocks/db.ts` y `src/domain/booking.ts`. Cambiar una palabra es cambiar la interfaz del apoderado.
   Verificación: un `grep` de cada mensaje contra el mock de la app pública coincide carácter por carácter.

9. [x] **`AllExceptionsFilter` global.**
   Normaliza `DomainError`, `ZodError`, `HttpException` y lo desconocido al formato `{ error, code }`. **Omite la clave `code` cuando no hay código**, porque dos respuestas del contrato congelado (`Reserva no encontrada`, `Falta weekStart`) vienen sin él. Nunca filtra el detalle de un 500 al cliente; va al log.
   Verificación: cubierta por la tarea 16.

10. [x] **`ZodValidationPipe`.**
    Valida cuerpos y query params, delega el formateo al filtro.

## Dominio

11. [x] **`src/domain/time.ts` + `time.spec.ts`.**
    `TIMEZONE`, `slotStartsAtIso`, `toChileDateString`, `weekMondayYmd`, `weekDaysMonSatYmd`, `isPastSlot`, y los dos helpers de columna `date`: `chileDateToColumn` (medianoche UTC) y `columnToChileDate`.
    Tests: viaje de ida y vuelta de una fecha de calendario, ejecutado además con `TZ=UTC` y con `TZ=America/Santiago`; y el test de cambio de horario **autoverificable** — un cupo de las `19:00` en una fecha de verano y otra de invierno chileno vuelve a formatearse como `19:00` local y sus horas UTC difieren, sin hardcodear la fecha de transición.
    Verificación: `pnpm test` y `TZ=UTC pnpm test` pasan igual.

12. [x] **`src/domain/booking.ts` + `booking.spec.ts`.**
    `normalizeName`, `normalizeHelpRequest`, `HELP_REQUEST_MAX_LENGTH`, `isValidChildAge`, `isSlotOccupied`, `confirmationDeadlinePassed`, `initialSessionStatus`, `canCancelSession`.
    Portadas de la app pública con los dos cambios ya acordados: las horas de plazo se inyectan (se borra el `hoursBefore = 24`) e `initialSessionStatus` devuelve `SessionStatus`.
    Tests con `vi.setSystemTime()`, nunca `new Date()` real: edad 2, 3, 13 y 14; nota de 500 y 501 caracteres; plazo vigente y vencido; cancelar antes y después de la hora de la cita.

13. [x] **`src/domain/auth.ts` y `src/domain/session-status.ts` con sus tests.**
    `normalizeEmail`, `PASSWORD_MIN_LENGTH`. El mapa `STATUS_TO_WIRE` tipado con `satisfies Record<SessionStatus, string>` contra el enum **importado del cliente generado**, y su inverso derivado del primero, no escrito a mano.
    Tests: los cuatro valores en ambas direcciones, y comprobar que agregar un estado al enum sin literal rompe la compilación.
    Cierra el criterio 6.

## Arranque y limpieza

14. [x] **`GET /api/health`.**
    `SELECT 1` contra Postgres; 200 con `{ status: 'ok' }` o 503 si la BD no responde.

15. [x] **Cablear `main.ts` y `app.module.ts`, y borrar el scaffold.**
    Prefijo global `/api`, CORS por `CORS_ORIGINS`, filtro global, `enableShutdownHooks()`. `ObserveModule` se monta **solo si** hay credenciales en el entorno, con lo que desaparecen los literales `'YOUR_APP_KEY'` y `'YOUR_APP_SECRET'`.
    Eliminar `src/app.controller.ts`, `src/app.controller.spec.ts`, `src/app.service.ts` y `test/app.e2e-spec.ts`.
    Verificación: `grep -r "Hello World\|YOUR_APP" src/ test/` no devuelve nada. Cierra el criterio 10.

16. [x] **Arnés de e2e y `test/health.e2e-spec.ts`.**
    `.env.test` apuntando a la base `agendamientos_test`; `globalSetup` que corre `prisma migrate deploy` una vez; helper que trunca todas las tablas en `beforeEach` (no en `afterEach`). Añadir `globalSetup` a `vitest.config.e2e.ts`.
    Casos: `GET /api/health` da 200; una ruta inexistente devuelve `{ error, code }` en JSON y no el HTML por defecto de Nest.
    Cierra el criterio 8.

17. [x] **Semilla idempotente.**
    `prisma/seed.ts` registrado como `"prisma": { "seed": "node prisma/seed.ts" }` — sin transpilador, Node 24 corre TypeScript.
    `upsert` de: la educadora (clave desde `SEED_EDUCATOR_PASSWORD`, hasheada con argon2, nunca en texto plano en el repo), `Preferences` 24/48/8, y **13 `TemplateSlot`**: lunes a viernes `19:00` y `20:00`, sábado `09:00`, `10:00` y `11:00`. Son 3 el sábado, no 4.
    Verificación: correrlo dos veces deja 13 filas. Cierra el criterio 4.

## Cierre

18. [x] **Scripts e ignores.**
    `postinstall` y `pretest` con `prisma generate`; scripts `db:up`, `db:migrate`, `db:seed`; `test:e2e` cargando `.env.test`. Ignorar `src/generated/` en `.oxlintrc.json` y `.prettierrc`.
    Opcional (aviso de Vitest 4): quitar `vite-tsconfig-paths` de los dos configs y usar `resolve.tsconfigPaths: true`.
    Verificación: un `rm -rf src/generated && pnpm test` en frío pasa. Cierra el criterio 9.

19. [x] **Documentación.**
    Reemplazar `README.md` (hoy es el del starter de NestJS) por el de esta API: qué es, cómo levantarla, comandos. Actualizar `CLAUDE.md` de la API, que ya no describe un «scaffold limpio». Actualizar en `../CLAUDE.md` la línea que dice que ninguna app tiene backend real.
    `../docs/mvp/` **no** se toca: esta spec no cambia ninguna regla de negocio.

20. [x] **Pasada final de verificación.**
    Ejecutar el bloque completo de «Verificación end-to-end» de `plan.md` desde un clon limpio y marcar los diez criterios de aceptación de `spec.md`. Dejar `status.md` en `Estado: completada`.

21. [ ] **Commit inicial del repo** — *pedir confirmación antes de ejecutar*.
    `profesor-scheduling-api` no tiene ningún commit todavía. Al cerrar la spec corresponde el primero, pero no se hace sin que el usuario lo pida.
