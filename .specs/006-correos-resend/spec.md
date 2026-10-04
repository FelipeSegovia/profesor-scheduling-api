# Spec: Envío de correos con Resend

## Objetivo

Que los correos que el MVP promete al apoderado y a la educadora lleguen de verdad. Hoy la
API escribe cada correo como una fila de `OutboxEmail` en la misma transacción que el cambio de
sesión que lo origina (spec 003 y 004), pero ningún proceso las despacha. Además,
`POST /api/auth/forgot` no manda correo: fuera de producción devuelve `devResetToken` y en
producción el apoderado no tiene cómo recuperar la clave.

Contexto y decisiones de arquitectura: `~/.claude/plans/crea-un-plan-para-adaptive-possum.md`.
Reglas canónicas: `../../../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`, secciones §Correos,
§Confirmación y plazo y §Cuenta opcional del apoderado.

Decisiones tomadas con el usuario:

- **Proveedor: Resend** (SDK `resend`), detrás de una interfaz `EmailSender` para poder
  cambiarlo y para que los tests usen un transporte falso.
- **Alcance: despachador del outbox + correo de reset de clave.** El job de vencimiento
  (`PENDING` → `NOT_CONFIRMED`, correo de liberación) y los correos de serie a la antelación
  configurada quedan para la spec siguiente.
- **Plantillas con React Email** (`@react-email/components` + `@react-email/render`), en `.tsx`.

Esta spec **no cambia** el contrato HTTP de ninguna ruta (`/api/*` ni `/api/panel/*`): mismas
rutas, mismas respuestas, mismos errores. Tampoco cambia qué filas de `OutboxEmail` se escriben
ni cuándo, salvo el requisito 7.

Estado: **aprobada** por el usuario, incluyendo el requisito 7.

## Requisitos funcionales

### 1. Configuración

- Variables en `src/config/env.ts` (validadas con Zod, el proceso no arranca si fallan):

  | Variable | Regla |
  | --- | --- |
  | `RESEND_API_KEY` | Opcional. Sin ella se usa el transporte de consola. **Obligatoria con `NODE_ENV=production`.** |
  | `EMAIL_FROM` | Obligatoria si hay `RESEND_API_KEY`. Formato `Nombre <correo>` o `correo`. |
  | `EMAIL_REPLY_TO` | Opcional, email. Se manda como `replyTo` en todos los correos al apoderado. |
  | `EMAIL_REDIRECT_TO` | Opcional, email. **Prohibida con `NODE_ENV=production`.** |
  | `OUTBOX_POLL_INTERVAL_MS` | Entero ≥ 1000, por defecto `15000`. |

- `.env.example` las documenta (ya hecho). `.env.test` y `.env.test.example` no llevan
  `RESEND_API_KEY`: los e2e nunca hablan con Resend. `.env.test.example` recibe además
  `EDUCATOR_JWT_SECRET`/`EDUCATOR_JWT_EXPIRES_IN`, que hoy le faltan.

### 2. Transporte de correo (`src/email/`)

- Interfaz `EmailSender.send({ to, subject, html, text, idempotencyKey? })` →
  `{ providerId: string | null }`; lanza si el envío falla. Token de inyección `EMAIL_SENDER`.
- `ResendEmailSender`: usa `emails.send` con `from = EMAIL_FROM`, `replyTo = EMAIL_REPLY_TO` y
  la `idempotencyKey` (el `id` de la fila del outbox), para que un reintento tras un timeout no
  duplique el correo. Un `{ error }` de Resend se convierte en excepción.
- Con `EMAIL_REDIRECT_TO`: el destinatario real se reemplaza por esa dirección y el asunto
  queda `[para: <real>] <asunto>`. Sirve para probar en el sandbox de Resend sin dominio
  verificado.
- `ConsoleEmailSender`: sin `RESEND_API_KEY`. Escribe en el log destinatario, asunto y versión
  texto; devuelve `providerId: null`.
- `EmailModule` (`@Global()`) elige el sender según la configuración.

### 3. Contenido de los correos

- Una plantilla React Email por tipo, con un layout común (encabezado "Loreto Castillo ·
  Educadora diferencial", pie con la nota de que es un correo automático). Cada correo sale con
  versión HTML y versión texto plano.
- `renderEmail(kind, data)` → `{ subject, html, text }`, sin Nest ni BD (testeable con
  `pnpm test`).
- Fechas y horas en `America/Santiago` (`TIMEZONE` de `src/domain/time.ts`), en español:
  "lunes 6 de octubre, 19:00".
- Enlaces armados desde `PUBLIC_WEB_URL` con las rutas de
  `public-parents-scheduling-web/src/App.tsx`:
  - Confirmo: `/sesion/:confirmToken/confirmar`
  - No puedo: `/sesion/:cancelToken/cancelar`
  - Restablecer clave: `/cuenta/restablecer/:token`

| Kind | Destinatario | Contenido |
| --- | --- | --- |
| `BOOKING_PENDING` | Apoderado | Cita reservada para `<niño>` el `<fecha, hora>`. Pide confirmar antes de `<startsAt − plazo>`, avisa que si no confirma el cupo se libera. Botones **Confirmo** y **No puedo**. |
| `BOOKING_CONFIRMED` | Apoderado | Cita reservada y confirmada. Enlace **No puedo** para cancelar. |
| `CONFIRMED` | Apoderado | Asistencia confirmada. Enlace **No puedo**. |
| `CANCELLED` | Apoderado | Cita cancelada. Sin enlaces. |
| `RESCHEDULED` | Apoderado | La cita de `<niño>` cambió al `<fecha, hora>` nueva. Si la sesión está `PENDING`, botones **Confirmo** y **No puedo**; si está `CONFIRMED`, solo **No puedo**. |
| `GUARDIAN_CONFIRMED` | Educadora | `<apoderado>` confirmó la cita de `<niño>` del `<fecha, hora>`. |
| `GUARDIAN_CANCELLED` | Educadora | `<apoderado>` canceló la cita de `<niño>` del `<fecha, hora>`; el cupo quedó libre. |
| `SYSTEM_CONFIRMED` | Educadora | Ver requisito 7. |
| Reset de clave | Apoderado | Enlace de un solo uso, vence en 1 hora. Si no lo pidió, puede ignorar el correo. |

- Invariante: los correos al apoderado solo mencionan su propia cita y su niño. Nunca datos de
  otra familia ni de la agenda de la educadora.
- El correo se arma con el estado de la sesión **al momento de enviar** (no hay payload en la
  fila). Consecuencia aceptada: si la educadora mueve una sesión dos veces antes de que salga
  el primer correo, los dos `RESCHEDULED` muestran la hora final.

### 4. Despachador del outbox

- Migración sobre `OutboxEmail`:
  - `nextAttemptAt DateTime @default(now())`
  - `providerId String?`
  - índice `(status, nextAttemptAt)` en lugar de `(status)`
  - `status` sigue siendo `String`, con valores documentados `PENDING | SENT | FAILED | SKIPPED`.
- `OutboxModule` nuevo que exporta `OutboxService` (hoy se provee por separado en
  `BookingsModule` y `PanelModule`) y el despachador.
- `OutboxDispatcherService.dispatchOnce()`:
  - Toma hasta 20 filas `status = 'PENDING' AND nextAttemptAt <= now()`, por `createdAt`.
  - Por cada fila, en serie (respeta el rate limit de Resend): carga sesión, niño, apoderado y
    `Preferences`; arma y envía el correo.
  - Éxito → `status = 'SENT'`, `sentAt`, `providerId`.
  - Error → `attempts + 1`, `error` (mensaje truncado), `nextAttemptAt` con backoff de 1, 5,
    15 y 60 minutos. Al 5º intento fallido → `FAILED`, no se reintenta más.
  - Sin sesión (`sessionId` nulo o borrada) → `FAILED` con `error = 'session not found'`.
  - Correo al apoderado de una sesión cuyo `startsAt` ya pasó → `SKIPPED`: no se manda un
    "confirma tu cita" de una cita que ya ocurrió (por ejemplo, tras una caída larga).
  - Correo al apoderado que invita a asistir (`BOOKING_PENDING`, `BOOKING_CONFIRMED`,
    `CONFIRMED`, `RESCHEDULED`) de una sesión que al enviar ya está `CANCELLED` o
    `NOT_CONFIRMED` → `SKIPPED`: sus enlaces ya no sirven y el apoderado recibe el de
    cancelación. *(Agregado al implementar la tarea 8.)*
  - Un fallo de una fila nunca corta el lote ni tumba el proceso.
- Se ejecuta cada `OUTBOX_POLL_INTERVAL_MS` vía `@nestjs/schedule` (`SchedulerRegistry`), sin
  solaparse: si un ciclo sigue corriendo, el siguiente se salta.
- Con `NODE_ENV=test` el intervalo no se registra; los e2e llaman `dispatchOnce()` a mano.
- Limitación asumida (igual que el bus SSE de la 005): un solo proceso de la API. Con varias
  instancias haría falta reclamar filas con `FOR UPDATE SKIP LOCKED`; queda fuera de alcance.

### 5. Correo de restablecer clave

- `AuthService.forgot` manda el correo **directo**, sin pasar por el outbox, después de crear
  el `PasswordReset`: así el token en claro nunca se guarda en la base (solo `tokenHash`).
- El envío no se espera (`void` con `catch` que registra el error): la respuesta tarda lo mismo
  exista o no la cuenta, y sigue siendo `200 { ok: true }`. Si falla, el apoderado vuelve a
  pedir el enlace.
- `devResetToken` se mantiene fuera de producción (lo usan los e2e y el front en desarrollo).

### 6. Documentación

- `CLAUDE.md` de esta app: sección de correo (transportes, despachador, estados del outbox,
  limitación de un proceso) y corregir "el job que despacha `OutboxEmail` … sigue sin existir".
- Comentario de `OutboxService` y del modelo `OutboxEmail` en `prisma/schema.prisma`.
- `docs/API.md`: nota sobre qué correo dispara cada endpoint y los enlaces que contiene.
  `docs/openapi.json` no debería cambiar (se regenera para comprobarlo).
- `../../../CLAUDE.md`: hoja de ruta. `../../../docs/mvp/` no cambia, salvo la decisión
  pendiente 1.

### 7. Correo a la educadora cuando la reserva pública nace confirmada

- Regla canónica (§Correos): la educadora recibe correo si "el sistema dejó la cita confirmada
  porque el plazo ya había vencido". Hoy `BookingsService.createBooking` no escribe esa fila.
- Cuando una reserva **pública** nace `CONFIRMED`, la misma transacción escribe además una fila
  `SYSTEM_CONFIRMED` dirigida a la educadora. Las citas creadas desde el panel no, porque las
  hizo ella.
- Contenido: "Nueva cita confirmada automáticamente: `<niño>` el `<fecha, hora>`, reservada por
  `<apoderado>` cuando el plazo de confirmación ya había vencido."
- Si no hay educadora en la base (solo pasa en tests sin seed), no se escribe la fila y la
  reserva sigue igual.
- No cambia `../../../docs/mvp/`: la regla ya existía, solo faltaba implementarla.

## Decisiones pendientes

- **Remitente en producción.** Requiere un dominio verificado en Resend (registros SPF/DKIM).
  Falta definir dominio y dirección. No bloquea la implementación: en desarrollo se usa
  `onboarding@resend.dev` con `EMAIL_REDIRECT_TO`.

## Fuera de alcance

- Job de vencimiento (`PENDING` → `NOT_CONFIRMED`) y su correo de liberación (`RELEASED`).
- Correos de cada sesión de una serie a la antelación configurada (`seriesNoticeHours`): hoy
  solo se escriben los que caen dentro de la ventana al crear la serie; esos sí se despachan.
- Recordatorios adicionales, adjuntos `.ics`, WhatsApp (fuera del MVP).
- Webhooks de Resend (rebotes, entregas, quejas) y supresión de direcciones.
- Pantalla o endpoint para ver o reintentar correos fallidos desde el panel.
- Varias instancias de la API.
- Cambios en `public-parents-scheduling-web/` o `private-profesor-scheduling/` (las rutas de
  los enlaces ya existen en el front público).

## Criterios de aceptación

- [ ] Sin `RESEND_API_KEY`, la API arranca y los correos aparecen en el log; con
      `NODE_ENV=production` sin `RESEND_API_KEY`, o con `EMAIL_REDIRECT_TO`, no arranca.
- [ ] `renderEmail` produce asunto, HTML y texto para cada kind y para el reset; los enlaces
      apuntan a `PUBLIC_WEB_URL` con el token correcto; la hora sale en `America/Santiago`
      (tests unitarios).
- [ ] Tras `POST /api/bookings`, `dispatchOnce()` con un sender falso envía un correo al
      apoderado con los dos enlaces y la fila queda `SENT` con `sentAt`.
- [ ] Si el sender lanza, la fila sigue `PENDING` con `attempts = 1`, `error` y
      `nextAttemptAt` en el futuro; al 5º fallo queda `FAILED`.
- [ ] Un fallo en una fila no impide enviar las demás del mismo lote.
- [ ] Una fila de una sesión que ya ocurrió queda `SKIPPED` sin llamar al sender.
- [ ] `GUARDIAN_CONFIRMED` y `GUARDIAN_CANCELLED` llegan a la educadora; ningún correo al
      apoderado contiene datos de otra familia.
- [ ] Una reserva pública que nace `CONFIRMED` deja `BOOKING_CONFIRMED` al apoderado y
      `SYSTEM_CONFIRMED` a la educadora; una que nace `PENDING`, o una cita creada desde el
      panel, no deja fila para la educadora.
- [ ] `POST /api/auth/forgot` con cuenta existente envía un correo con el enlace de reset; sin
      cuenta, no envía nada; en ambos casos responde `200 { ok: true }` (+ `devResetToken` fuera
      de producción).
- [ ] Prueba manual: con Resend en sandbox y `EMAIL_REDIRECT_TO`, una reserva desde el front
      público llega al correo y los enlaces Confirmo / No puedo funcionan.
- [ ] Los e2e existentes pasan sin modificarse; `docs/openapi.json` regenerado sin cambios.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` en verde.
