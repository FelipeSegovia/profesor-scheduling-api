# Plan: Reserva pública completa

Diseño técnico de [`spec.md`](./spec.md). Estado previo: `001-fundaciones-dominio` (dominio, Prisma, errores) y `002-documentacion-swagger` (`/api/docs`).

## Estructura de módulos

```
src/
  domain/
    booking.ts            + hasAllRequiredBookingFields, REQUIRED_BOOKING_FIELDS_MESSAGE (nuevo)
  common/
    tokens/
      random-token.ts      # confirmToken/cancelToken/resetToken: crypto.randomBytes(24).toString('hex')
    prisma/
      prisma-errors.ts      # isSlotTakenViolation(err)
  slots/
    slots.module.ts
    slots.controller.ts     # GET /slots
    slots.service.ts        # plantilla + bloqueos + ocupación + horizonte
    slots.types.ts           # SlotView (para el plugin de Swagger)
  bookings/
    bookings.module.ts
    bookings.controller.ts   # POST /bookings, GET /bookings/:id
    sessions.controller.ts   # POST /sessions/confirm/:token, /sessions/cancel/:token
    bookings.service.ts      # createBooking, getBookingBundle, confirmByToken, cancelByToken
    bookings.schemas.ts       # Zod: createBookingSchema
    bookings.types.ts          # BookingResult, GuardianDto, ChildDto, SessionDto
  auth/
    auth.module.ts
    auth.controller.ts        # /auth/*
    auth.service.ts            # register/login/logout/me/email-status/forgot/reset
    auth.schemas.ts             # Zod: register/login/forgot/reset
    auth.types.ts                 # AuthResult, GuardianProfile
    token.service.ts               # firma/verifica JWT, sign(guardianId, tokenVersion)
    guardian-context.middleware.ts  # decodifica Bearer opcional, no lanza
    guardian.decorator.ts            # @CurrentGuardian() lee request.guardian
    guardian-auth.guard.ts            # exige request.guardian, si no 401 NO_SESSION
  outbox/
    outbox.service.ts        # writeOutboxEmail(kind, recipient, sessionId?) — solo INSERT
```

`SlotsModule`, `BookingsModule` y `AuthModule` importan `PrismaModule` (ya `@Global()`, no hace falta reimportar) y se registran en `AppModule`. `AuthModule` exporta `TokenService`, `GuardianContextMiddleware` y el decorator/guard; `BookingsModule` los importa (necesita el `Bearer` opcional en `POST /bookings`).

## Autenticación del apoderado (JWT)

Se agrega `@nestjs/jwt`. `JwtModule.registerAsync` con `secret`/`signOptions.expiresIn` desde `ConfigService` (`JWT_SECRET`, `JWT_EXPIRES_IN`, ya existentes en `env.ts` desde 001).

**Payload**: `{ sub: guardianId, tokenVersion }`. Sin roles ni email en el payload.

**Emisión** (`TokenService.sign(guardian)`): `jwtService.signAsync({ sub: guardian.id, tokenVersion: guardian.tokenVersion })`.

**Verificación en dos niveles**, porque el `Bearer` es opcional en `POST /bookings` y `POST /logout`, y obligatorio en `GET /me`:

1. `GuardianContextMiddleware`, aplicado a las rutas de `bookings` y `auth`: lee `Authorization`, si hay `Bearer <token>` intenta `jwtService.verifyAsync`; si es válido, busca el `Guardian` por `sub` y compara `tokenVersion`. Si calza, setea `req.guardian = { id, email, tokenVersion }`. Cualquier fallo (ausente, malformado, vencido, `tokenVersion` desactualizado, guardian borrado) deja `req.guardian` sin definir — **nunca lanza**.
2. `GuardianAuthGuard`, usado solo en `GET /me`: si `req.guardian` no está seteado, lanza `DomainError(ErrorMessage.NO_SESSION, 401, 'NO_SESSION')`.

`@CurrentGuardian()` es un `createParamDecorator` que lee `request.guardian`.

**Invalidar sesiones**: se usa `Guardian.tokenVersion` (ya en el esquema desde 001). `reset` incrementa `tokenVersion`, lo que invalida de inmediato cualquier JWT emitido antes. `logout` es un no-op del lado del servidor (JWT sin estado) — responde 204 igual.

## Password hashing

`Guardian.passwordHash` con **argon2**, igual que la educadora en el seed de 001. Nunca SHA-256.

## Reset de clave

`PasswordReset.tokenHash` guarda el hash SHA-256 del token (aleatorio de alta entropía, no clave elegida por humano — no necesita argon2). El token en texto plano solo existe en la respuesta HTTP (y solo fuera de producción, como `devResetToken`).

- `expiresAt` = ahora + 1 hora.
- `reset` exitoso: marca `usedAt`, incrementa `Guardian.tokenVersion`.
- `devResetToken` se gatea por `NODE_ENV !== 'production'`, mismo criterio que `/api/docs` en la spec 002.

## Cálculo de cupos (`SlotsService`)

```ts
async function buildWeekSlots(mondayYmd: string): Promise<SlotView[]> {
  const days = weekDaysMonSatYmd(mondayYmd);
  const dayBlocks = await prisma.dayBlock.findMany({ where: { date: { in: days.map(chileDateToColumn) } } });
  const blockedDays = new Set(dayBlocks.map(b => columnToChileDate(b.date)));

  const templates = await prisma.templateSlot.findMany();
  const slotBlocks = await prisma.slotBlock.findMany({ where: { date: { in: days.map(chileDateToColumn) } } });
  const blockedSlots = new Set(slotBlocks.map(b => `${columnToChileDate(b.date)}T${b.time}`));

  const startsAtCandidates = days.flatMap(date =>
    templates.filter(t => t.weekday === weekdayOf(date)).map(t => ({ date, time: t.time })),
  );
  const sessions = await prisma.session.findMany({
    where: { startsAt: { in: startsAtCandidates.map(c => new Date(slotStartsAtIso(c.date, c.time))) } },
    select: { startsAt: true, status: true },
  });

  const prefs = await prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
  const horizonLimitYmd = /* lunes actual + bookingHorizonWeeks*7 días */;

  return startsAtCandidates
    .filter(c => !blockedDays.has(c.date))
    .map(c => {
      const startsAt = slotStartsAtIso(c.date, c.time);
      const past = isPastSlot(startsAt);
      const occupied = isSlotOccupied(startsAt, sessions) || blockedSlots.has(`${c.date}T${c.time}`);
      const beyondHorizon = mondayYmd > horizonLimitYmd;
      return { date: c.date, time: c.time, startsAt, past, available: !occupied && !past && !beyondHorizon };
    });
}
```

Todas las consultas son de solo lectura, sin transacción. `weekdayOf` ya existe en `domain/time.ts` (portado en 001 pero sin uso hasta ahora).

## Creación de reserva: transacción y carrera

`BookingsService.createBooking(input, currentGuardian?)`:

1. **Fuera de la transacción** (lecturas + validaciones puras de dominio, en el orden exacto de `spec.md`): `isValidChildAge`, `hasAllRequiredBookingFields`, comparación de email si `currentGuardian`, lectura de `Guardian` por email para saber si ya tiene cuenta (`emailAccount`), validaciones de `createAccount`/clave, `isPastSlot`, lectura de sesiones activas en ese `startsAt` (chequeo optimista de `SLOT_TAKEN`, no definitivo), `normalizeHelpRequest` + límite de largo.
2. **`prisma.$transaction(async tx => { ... })`**: upsert de `Guardian` (crea o actualiza condicionalmente según `canUpdateProfile`), upsert de `Child` por `[guardianId, normalizedName]`, `tx.session.create(...)` con `confirmToken`/`cancelToken` generados por `random-token.ts`, y si `createAccount`, hash de la clave y set de `passwordHash` en el mismo `tx.guardian.update`. Al final, `tx.outboxEmail.create({ kind: ..., recipient: guardian.email, sessionId: session.id })`.
3. **Captura de la carrera real**: el chequeo del paso 1 es best-effort; la garantía real es el índice único parcial `session_active_slot`. Si `tx.session.create` viola ese índice, Prisma lanza `PrismaClientKnownRequestError` con `code: 'P2002'`. `common/prisma/prisma-errors.ts` centraliza la traducción a `DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN')` para ese `create` puntual.
4. Si `createAccount`, se firma el JWT (`TokenService.sign`) después del commit de la transacción.

## Confirmar / cancelar

`confirmByToken`/`cancelByToken`:

1. Buscan la `Session` por `confirmToken`/`cancelToken`. No existe → `INVALID_TOKEN` 404.
2. Si ya está en el estado destino → devuelven el bundle actual sin escribir nada (ni `OutboxEmail`).
3. Si no es válida la transición (`NOT_PENDING` / `CANCEL_NOT_ALLOWED`) → el error correspondiente.
4. Si es válida: `update` del `status` + `outboxEmail.create` (`kind: 'CONFIRMED'`/`'CANCELLED'`), en una sola `$transaction`.

## Zod: principio de diseño

Los esquemas Zod de esta spec son deliberadamente permisivos en presencia de campos: solo verifican tipo (`z.string()`, `z.coerce.number()` para `childAge`), no rechazan strings vacíos. Los mensajes/códigos exactos del contrato (`MISSING_FIELDS`, `WEAK_PASSWORD`) los produce el dominio, no Zod — si Zod rechazara un `email: ''` con su propio error, el filtro global emitiría `VALIDATION_ERROR` genérico, pisando el contrato congelado. Zod aquí solo protege contra tipos completamente equivocados.

**`GET /api/slots`**: el mensaje `"Falta weekStart"` sin `code` no puede salir de `ZodValidationPipe` (que siempre añade `code: VALIDATION_ERROR`). Esa ruta valida `weekStart` a mano en el controlador, antes de cualquier Zod.

**`register`**: `assertPassword` corre antes que la validación de campos requeridos; `AuthService.register` reproduce ese orden a mano.

## Documentar en Swagger sin DTOs de clase

Se mantiene el patrón de 002: tipos TS planos (no clases, no `class-validator`), el plugin CLI de `@nestjs/swagger` infiere el esquema por análisis estático del tipo de retorno del método del controlador.

- Cada método declara su tipo de retorno explícito (`Promise<BookingResult>`, `Promise<{ slots: SlotView[] }>`, etc.).
- Tipos compartidos (`BookingResult`, `SlotView`, `AuthResult`, `GuardianProfile`, `GuardianDto`, `ChildDto`, `SessionDto`) viven en `*.types.ts` de cada módulo, como interfaces.
- Query params (`weekStart`, `email`) se documentan a mano con `@ApiQuery({ name, required, type: String })`.
- Cada endpoint lleva `@ApiTags('slots'|'bookings'|'sessions'|'auth')`, `@ApiOperation({ summary })`, y un `@ApiResponse` por cada status code documentado en `spec.md`.
- `@ApiBearerAuth()` en `GET /me`.

## Fuera de alcance (técnico)

- No se agrega `passport`/`@nestjs/passport`: el middleware + guard a medida es suficiente para un solo actor (`Guardian`) y una sola forma de sesión (JWT sin refresh).
- No se agrega ningún adaptador de correo (`resend`): `outbox.service.ts` solo hace `INSERT`.
- No se agrega `@nestjs/schedule`: nada de esta spec corre en background.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `GET /api/bookings/:id` no valida quién pregunta | Heredado del contrato congelado del mock; confirmado con el usuario mantenerlo igual. |
| Traducir el `P2002` del índice no modelado es frágil entre versiones de Prisma | Test e2e dedicado que fuerza la carrera con dos inserciones concurrentes reales contra Postgres. |
| `GuardianContextMiddleware` silencioso puede esconder bugs | Se loguea a nivel `debug` cualquier verificación fallida, sin exponerlo al cliente. |
| Horizonte de reserva sin precedente en el mock | Se pliega en `available: false`, no un campo nuevo ni un error. |

## Verificación end-to-end

```bash
pnpm add @nestjs/jwt
pnpm test
pnpm test:e2e
pnpm lint && pnpm build
pnpm start:dev
curl "localhost:3000/api/slots"
curl "localhost:3000/api/slots?weekStart=2026-10-05"
curl -X POST localhost:3000/api/bookings -d '{...}' -H 'content-type: application/json'
```

Cierra la spec cuando todos los criterios de aceptación de `spec.md` están marcados.
