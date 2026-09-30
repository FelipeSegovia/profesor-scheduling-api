# Tasks: Reserva pública completa

Orden de ejecución de [`plan.md`](./plan.md). Cada tarea deja el repo en verde (`pnpm lint && pnpm build`). Actualizar [`status.md`](./status.md) al cerrar cada tarea.

## Dominio y utilidades compartidas

1. [x] **Portar `hasAllRequiredBookingFields` y `REQUIRED_BOOKING_FIELDS_MESSAGE` a `src/domain/booking.ts`**, desde `public-parents-scheduling-web/src/domain/booking.ts`, con su test en `booking.spec.ts`.
2. [x] **`src/common/tokens/random-token.ts`**: `randomToken(): string` sobre `crypto.randomBytes(24).toString('hex')`.
3. [x] **`src/common/prisma/prisma-errors.ts`**: `isSlotTakenViolation(err: unknown): boolean` (Prisma `P2002`). Test unitario con error simulado.

## Cupos

4. [x] **`src/slots/slots.types.ts`**: interfaz `SlotView`.
5. [x] **`src/slots/slots.service.ts`**: `buildWeekSlots(mondayYmd)` según `plan.md`.
6. [x] **`src/slots/slots.controller.ts` + `slots.module.ts`**: `GET /slots`, valida `weekStart` a mano. `@ApiTags('slots')`.

## Autenticación del apoderado (base)

7. [x] **Instalar `@nestjs/jwt`.** `AuthModule` con `JwtModule.registerAsync`.
8. [x] **`src/auth/token.service.ts`**: `sign`/`verify`. Test unitario.
9. [x] **`GuardianContextMiddleware`, `@CurrentGuardian()`, `GuardianAuthGuard`.** Tests unitarios del guard.

## Reservas

10. [x] **`src/bookings/bookings.types.ts`**: `GuardianDto`, `ChildDto`, `SessionDto`, `BookingResult`.
11. [x] **`src/bookings/bookings.schemas.ts`**: `createBookingSchema` (Zod permisivo).
12. [x] **`src/bookings/bookings.service.ts` — `createBooking`.** Orden exacto de validaciones, transacción, traducción `P2002`→`SLOT_TAKEN`, `OutboxEmail`, JWT si `createAccount`. Tests e2e cubriendo cada criterio de aceptación, incluida carrera real con `Promise.allSettled`.
13. [x] **`bookings.controller.ts` — `POST /bookings`, `GET /bookings/:id`.** `@ApiTags('bookings')`.
14. [x] **`sessions.controller.ts` — confirm/cancel.** Tests e2e: token inválido, transición inválida, idempotencia, cancelar tras la hora.

## Cuenta opcional del apoderado

15. [x] **`src/auth/auth.types.ts`**: `AuthResult`, `GuardianProfile`.
16. [x] **`src/auth/auth.schemas.ts`**: schemas Zod permisivos.
17. [x] **`auth.service.ts` — `register`, `login`, `emailHasAccount`.** Tests e2e: orden de validación, asociación a guardian existente, `INVALID_CREDENTIALS`.
18. [x] **`auth.service.ts` — `forgot`, `reset`.** Tests e2e: `INVALID_RESET`, invalidación de JWT tras reset.
19. [x] **`auth.service.ts` — `me`, `logout`.** Tests e2e.
20. [x] **`auth.controller.ts` + `auth.module.ts`**, montando `GuardianContextMiddleware`. `@ApiTags('auth')`, `@ApiBearerAuth()` en `me`.

## Cierre

21. [x] **`outbox.service.ts` — revisión final.** Test e2e contando filas antes/después.
22. [x] **Verificación de Swagger para todos los endpoints nuevos.** Test que parsea `/api/docs-json` y falla si falta alguna ruta/tag/summary.
23. [x] **Suite e2e completa desde clon limpio.** `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`.
24. [x] **Documentación.** Actualizar `CLAUDE.md`/`README.md` de la API.
25. [x] **Pasada final de verificación y cierre.** Marcar criterios de aceptación de `spec.md`, `status.md` a `completada`.
