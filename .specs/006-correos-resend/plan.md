# Plan: Envío de correos con Resend

Diseño técnico de [`spec.md`](./spec.md). Estado previo:
- `OutboxService.write` (`src/outbox/outbox.service.ts`) inserta filas `OutboxEmail` dentro de
  la transacción de cada cambio de sesión, desde `BookingsService` y `PanelSessionsService`.
  Se provee dos veces, en `BookingsModule` y en `PanelModule`.
- Nada despacha esas filas y no hay mailer.
- `AuthService.forgot` crea el `PasswordReset` y devuelve `devResetToken` fuera de producción.

## Dependencias y configuración de compilación

```bash
pnpm add resend @react-email/components @react-email/render react react-dom @nestjs/schedule
pnpm add -D @types/react @types/react-dom
```

- **`tsconfig.json`**: `"jsx": "react-jsx"`. Con `module: nodenext` el compilador emite
  `import { jsx } from 'react/jsx-runtime'`, que `react` exporta. Las plantillas son `.tsx` y
  se importan como `./templates/booking-pending.js`, igual que el resto (ESM).
- **`nest build`**: compila `.tsx` con `tsc` sin configuración extra. El plugin de Swagger solo
  mira controladores y DTOs, así que no le afecta.
- **`vitest.config.ts`**: `include: ['**/*.spec.ts', '**/*.spec.tsx']`. Vite transforma JSX
  con esbuild, y `jsx: react-jsx` del tsconfig hace que use el runtime automático.
- **Lint**: `oxlint --type-aware src/ test/` ya recorre `.tsx`. Hay que verificarlo en la
  tarea 1 y ajustar el script si no.

## Estructura

```
src/config/env.ts                      # + EMAIL_REPLY_TO, OUTBOX_POLL_INTERVAL_MS, reglas de prod
src/email/
  email.module.ts                      # @Global(); factory de EMAIL_SENDER
  email-sender.ts                      # interfaz EmailSender, EMAIL_SENDER, OutgoingEmail
  resend-email.sender.ts
  console-email.sender.ts
  redirect.ts                          # applyRedirect(email, redirectTo) — puro
  redirect.spec.ts
  email-links.ts                       # confirmUrl / cancelUrl / resetUrl — puro
  email-links.spec.ts
  format.ts                            # formatSessionDateTime(date) — es, America/Santiago
  format.spec.ts
  render-email.tsx                     # renderEmail(message) → { subject, html, text }
  render-email.spec.tsx
  templates/
    layout.tsx
    booking-pending.tsx  booking-confirmed.tsx  confirmed.tsx  cancelled.tsx
    rescheduled.tsx  guardian-confirmed.tsx  guardian-cancelled.tsx
    system-confirmed.tsx  password-reset.tsx
src/outbox/
  outbox.module.ts                     # nuevo: provee/exporta OutboxService y el despachador
  outbox.service.ts                    # + OutboxKind.SYSTEM_CONFIRMED, OutboxStatus
  outbox-dispatcher.service.ts         # dispatchOnce(), registro del intervalo
  outbox-message.ts                    # buildMessage(row, session bundle, prefs, links) — puro
  outbox-message.spec.ts
  retry.ts                             # nextAttempt(attempts, now) — puro
  retry.spec.ts
prisma/schema.prisma                   # OutboxEmail: nextAttemptAt, providerId, índice
prisma/migrations/<ts>_outbox_dispatch/
test/outbox-dispatch.e2e-spec.ts
test/helpers/app.ts                    # createTestApp({ emailSender? })
test/helpers/fake-email-sender.ts
```

## Configuración (`src/config/env.ts`)

- Variables vacías: `RESEND_API_KEY=` en un `.env` llega como `""`. Un `z.preprocess` las
  convierte en `undefined` (helper `optionalString`), para que "vacía" signifique "no
  configurada" y no "API key inválida".
- `EMAIL_REPLY_TO` y `EMAIL_REDIRECT_TO` usan `z.email().optional()`, y
  `OUTBOX_POLL_INTERVAL_MS` usa `z.coerce.number().int().min(1000).default(15000)`.
- `.superRefine` sobre el objeto:
  - `RESEND_API_KEY` sin `EMAIL_FROM` → issue en `EMAIL_FROM`;
  - `NODE_ENV === 'production'` sin `RESEND_API_KEY` → issue;
  - `NODE_ENV === 'production'` con `EMAIL_REDIRECT_TO` → issue.

  `validateEnv` ya lista todos los issues, así que no hay que tocarlo.
- Se quita el comentario "pasan a requeridas en la 002".

## Transporte

```ts
export interface OutgoingEmail { to: string; subject: string; html: string; text: string; idempotencyKey?: string }
export interface EmailSender { send(email: OutgoingEmail): Promise<{ providerId: string | null }> }
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
```

- **`ResendEmailSender`**:
  ```ts
  const { data, error } = await this.resend.emails.send(
    { from, to, replyTo, subject, html, text },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  if (error) throw new Error(`${error.name}: ${error.message}`);
  return { providerId: data.id };
  ```
  Antes de enviar aplica `applyRedirect(email, EMAIL_REDIRECT_TO)`, que cambia `to` y antepone
  `[para: <real>] ` al asunto. La función es pura y se testea sola.
- **`ConsoleEmailSender`**: `Logger.log` con `to`, `subject` y `text`, y devuelve
  `{ providerId: null }`.
- **`EmailModule`**: `{ provide: EMAIL_SENDER, inject: [ConfigService], useFactory }`.
  Devuelve `ResendEmailSender` si hay `RESEND_API_KEY` y `ConsoleEmailSender` si no. Es
  `@Global()` porque lo inyectan `OutboxModule` y `AuthModule`, que no se conocen entre sí.
  Mismo criterio que `EventsModule`.

## Contenido

- **`format.ts`**: `formatInTimeZone(date, TIMEZONE, "EEEE d 'de' MMMM, HH:mm", { locale: es })`
  → "lunes 6 de octubre, 19:00". `TIMEZONE` sale de `src/domain/time.ts` y `es` de
  `date-fns/locale`.
- **`email-links.ts`**: `new URL('/sesion/' + token + '/confirmar', PUBLIC_WEB_URL)`, más sus
  equivalentes para cancelar y restablecer. Recibe la base por parámetro, sin `ConfigService`,
  para que sea puro.
- **Mensaje como unión discriminada**. Cada plantilla recibe solo los datos que muestra:
  ```ts
  type EmailMessage =
    | { kind: 'BOOKING_PENDING'; to; childName; startsAt; confirmBy; confirmUrl; cancelUrl }
    | { kind: 'BOOKING_CONFIRMED' | 'CONFIRMED'; to; childName; startsAt; cancelUrl }
    | { kind: 'CANCELLED'; to; childName; startsAt }
    | { kind: 'RESCHEDULED'; to; childName; startsAt; confirmUrl: string | null; cancelUrl }
    | { kind: 'GUARDIAN_CONFIRMED' | 'GUARDIAN_CANCELLED' | 'SYSTEM_CONFIRMED'; to; childName; guardianName; startsAt }
    | { kind: 'PASSWORD_RESET'; to; resetUrl; expiresInMinutes };
  ```
  Así, por tipos, un correo al apoderado no puede recibir `guardianName` de otra familia. De
  todos modos solo existe su propia sesión en el bundle.
- **`renderEmail(message)`**: un `switch` exhaustivo sobre `kind`. Arma
  `{ subject, element }` y luego:
  ```ts
  const html = await render(element);
  const text = await render(element, { plainText: true });
  ```
- **Asuntos**, en español y sin datos de terceros. Por ejemplo `BOOKING_PENDING` → "Confirma
  la sesión de <niño> del <fecha>".
- **`layout.tsx`**: `Html`, `Head`, `Preview`, `Body`, `Container`, encabezado "Loreto
  Castillo · Educadora diferencial" y pie "Este es un correo automático". Se usan `Button`
  para Confirmo / No puedo y estilos inline (`@react-email/components`), sin Tailwind.

## Esquema

```prisma
model OutboxEmail {
  // ... campos actuales
  /// PENDING | SENT | FAILED | SKIPPED (spec 006).
  status        String    @default("PENDING")
  nextAttemptAt DateTime  @default(now())
  providerId    String?
  @@index([status, nextAttemptAt])
}
```

- Migración `outbox_dispatch` con `pnpm db:migrate --name outbox_dispatch` y después
  `pnpm prisma generate`.
- Las filas existentes reciben `nextAttemptAt = now()` por el default, así que entran en el
  primer ciclo.
- `OutboxStatus` se agrega como const en `outbox.service.ts`, junto a `OutboxKind`.
  `OutboxKind` suma `SYSTEM_CONFIRMED`.

## Despachador

```ts
@Injectable()
export class OutboxDispatcherService implements OnModuleInit {
  private running = false;

  onModuleInit() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    const ms = this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true });
    this.scheduler.addInterval('outbox-dispatch', setInterval(() => void this.tick(), ms));
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.dispatchOnce(); }
    catch (err) { this.logger.error(err); }
    finally { this.running = false; }
  }

  async dispatchOnce(now = new Date()): Promise<{ sent: number; failed: number; skipped: number }> { … }
}
```

- `ScheduleModule.forRoot()` se registra en `AppModule`. `SchedulerRegistry` limpia los
  intervalos al cerrar la app, así que no quedan timers colgando en `app.close()`.
- **`dispatchOnce`**:
  1. `findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take: 20 })`.
  2. `Preferences` y `PUBLIC_WEB_URL` se leen una vez por ciclo.
  3. Por cada fila, en serie y con su propio `try/catch`:
     - **Carga**: `session.findUnique({ include: { child: true, guardian: true } })`. Si no
       existe → `FAILED`, `error: 'session not found'`.
     - **Mensaje**: `buildMessage(row, bundle, prefs, links)` es puro y devuelve
       `{ skip: true } | EmailMessage`. Hace `skip` si el kind va al apoderado y
       `session.startsAt <= now`; en ese caso la fila queda `SKIPPED`.
     - **Envío**: `sender.send({ ...await renderEmail(message), to: row.recipient, idempotencyKey: row.id })`.
       Se usa `row.recipient` y no el email actual del apoderado: es el destinatario que fijó
       la transacción.
     - **OK** → `update({ status: 'SENT', sentAt: now, providerId, error: null })`.
     - **Error** → `nextAttempt(row.attempts + 1, now)` devuelve
       `{ status: 'PENDING', nextAttemptAt } | { status: 'FAILED' }`. Se guarda
       `attempts + 1` y `error` truncado a 500 caracteres.
- **`retry.ts`**: `RETRY_DELAYS_MIN = [1, 5, 15, 60]` y `MAX_ATTEMPTS = 5`. Con
  `attempts >= MAX_ATTEMPTS` la fila pasa a `FAILED`.
- **Reglas de `buildMessage` por kind**:
  - `BOOKING_PENDING`: `confirmBy = startsAt − confirmationDeadlineHours`.
  - `RESCHEDULED`: `confirmUrl` solo si `session.status === 'PENDING'`.
  - `CONFIRMED`, `BOOKING_CONFIRMED` y `RESCHEDULED`: llevan `cancelUrl`.
  - Correos a la educadora: no hacen `skip` por fecha. Un aviso de cancelación atrasado
    igual le sirve.
  - Un `kind` desconocido → `FAILED` con `error: 'unknown kind'`.
- **`OutboxModule`**: `providers: [OutboxService, OutboxDispatcherService]` con
  `exports: [OutboxService, OutboxDispatcherService]`. `BookingsModule` y `PanelModule` lo
  importan en vez de proveer `OutboxService`.

## Requisito 7: `SYSTEM_CONFIRMED`

En `BookingsService.createBooking`, dentro de la transacción y después del `outbox.write`
actual:

```ts
if (status === 'CONFIRMED') {
  // La regla canónica avisa a la educadora cuando el sistema deja la cita
  // confirmada porque el plazo ya venció (spec 006, requisito 7).
  const educator = await tx.educator.findFirst();
  if (educator) {
    await this.outbox.write({ kind: OutboxKind.SYSTEM_CONFIRMED, recipient: educator.email, sessionId: session.id }, tx);
  }
}
```

`findFirst` en vez de `findFirstOrThrow`: `test/bookings.e2e-spec.ts` no siembra educadora, y
el caso "nace CONFIRMED" tiene que seguir pasando sin cambios. `PanelSessionsService` no se
toca.

## Reset de clave

En `AuthService.forgot`, después de `passwordReset.create`:

```ts
void this.sendResetEmail(guardian.email, plainToken).catch((err) =>
  this.logger.error(`No se pudo enviar el correo de restablecer clave: ${err}`),
);
```

- `sendResetEmail` arma un mensaje `PASSWORD_RESET` con `expiresInMinutes = RESET_TTL_MS / 60000`
  y llama `renderEmail`, después `sender.send` (sin `idempotencyKey`).
- No se espera, así que la latencia de la respuesta no depende de que exista la cuenta.
- `AuthModule` inyecta `EMAIL_SENDER`, que es global, y `ConfigService` para `PUBLIC_WEB_URL`.

## Tests

### Unitarios (`pnpm test`)

| Archivo | Qué cubre |
| --- | --- |
| `format.spec.ts` | Fecha y hora en español, en `America/Santiago` (incluye un cambio de horario). |
| `email-links.spec.ts` | Base con y sin `/` final. |
| `redirect.spec.ts` | Con y sin `EMAIL_REDIRECT_TO`. |
| `retry.spec.ts` | Delays 1/5/15/60 y `FAILED` al 5º intento. |
| `outbox-message.spec.ts` | Cada kind; `skip` por fecha pasada solo para correos al apoderado; `RESCHEDULED` con y sin `confirmUrl`. |
| `render-email.spec.tsx` | Para cada kind: asunto no vacío, el `html` contiene los enlaces esperados, el `text` contiene el nombre del niño y la fecha formateada, y los correos al apoderado no contienen `guardianName` de la educadora. |

### E2e

- **`test/helpers/fake-email-sender.ts`**: guarda los envíos en `sent[]`. `failNext(n)` hace
  que las próximas `n` llamadas lancen.
- **`createTestApp({ emailSender })`**: si viene el sender, hace `.overrideProvider(EMAIL_SENDER).useValue(...)`.
  Sin argumento, se comporta igual que hoy, así que los e2e existentes no cambian. En test no
  hay `RESEND_API_KEY`, entonces el sender por defecto es el de consola.
- **`test/outbox-dispatch.e2e-spec.ts`**:
  - reserva pública → `dispatchOnce()` → 1 envío al apoderado con `/sesion/<confirmToken>/confirmar`
    y `/sesion/<cancelToken>/cancelar`, y la fila queda `SENT`;
  - confirmar por token → `CONFIRMED` al apoderado y `GUARDIAN_CONFIRMED` a la educadora;
  - el sender falla → `attempts = 1` y `nextAttemptAt > now`. Con `dispatchOnce(future)`
    repetido 5 veces queda `FAILED`;
  - en un lote de 2 filas, si la primera falla igual se envía la segunda;
  - una sesión con `startsAt` pasado (se inserta directo con Prisma) queda `SKIPPED` y
    `sent` sigue vacío;
  - reserva que nace `CONFIRMED` con educadora sembrada → filas `BOOKING_CONFIRMED` y
    `SYSTEM_CONFIRMED`. Una cita creada desde el panel no deja `SYSTEM_CONFIRMED`;
  - `POST /api/auth/forgot` con cuenta → hay un envío con `/cuenta/restablecer/<devResetToken>`
    (como el envío no se espera, se usa `vi.waitFor`). Sin cuenta, no hay envíos.
- **Config**: se testea con `validateEnv` en un unitario (`src/config/env.spec.ts`), con los
  casos de producción sin key, producción con redirect y key sin from.

## Documentación

- **`CLAUDE.md`**:
  - sección "Correo (spec 006)": transportes, `EMAIL_REDIRECT_TO`, despachador, estados del
    outbox, `SYSTEM_CONFIRMED`, limitación de un proceso y reset directo sin outbox;
  - corregir el párrafo "El job que despacha `OutboxEmail` y vence las sesiones…": solo falta
    el vencimiento;
  - agregar la 006 a la lista del flujo SDD.
- **`docs/API.md`**: tabla "Correos que dispara cada endpoint". `pnpm docs:openapi` y
  `git diff docs/openapi.json` vacío.
- **`../CLAUDE.md`**: hoja de ruta (los correos ya salen y queda el job de vencimiento).
- **Comentarios**: los de `OutboxService` y del modelo `OutboxEmail`.

## Riesgos

- **React Email + ESM + `nest build`**: es el punto más incierto. Por eso la tarea 1 lo
  valida con una plantilla mínima, `pnpm build` y `node dist/main` antes de escribir el resto.
  Si falla, el fallback es renderizar con `react-dom/server` directamente. No se cambia la
  decisión de plantillas sin consultar al usuario.
- **Rate limit de Resend**: con envío en serie y lotes de 20, un 429 cae en el backoff normal.
  En el volumen del MVP no hace falta más.
- **Reinicio a mitad de envío**: si el proceso muere después de que Resend aceptó el correo y
  antes de marcar `SENT`, el reintento usa la misma `idempotencyKey` y Resend no duplica el
  correo, dentro de su ventana de 24 h.
