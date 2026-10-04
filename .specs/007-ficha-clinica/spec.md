# Spec: Ficha clínica por niño

## Objetivo

Que la educadora lleve, desde el panel, un historial de lo que ha trabajado con cada niño: una
lista de registros fechados que puede crear, corregir y borrar. Al crear un registro elige si el
apoderado lo recibe por correo. El historial completo de un niño se puede exportar en PDF.

Hoy el panel solo guarda los datos de contacto (`Guardian`: nombre, email y teléfono; `Child`:
nombre y edad) y las sesiones de la agenda. No hay notas ni exportación.

Plan general: `~/.claude/plans/crea-un-plan-para-synthetic-wirth.md`. El frontend va en su propia
spec, `private-profesor-scheduling/.specs/006-ficha-clinica/`.

Decisiones tomadas con el usuario (2026-10-03):

- **Cada registro tiene** fecha, título corto, texto libre y una sesión de la agenda opcional.
- **Correo opcional por registro.** Al crear, ella decide si se envía. Si se envía, lleva el
  registro completo.
- **Se puede editar y borrar.** Editar no reenvía el correo.
- **Orden de las specs:** esta es la 007. El job de vencimiento (`NOT_CONFIRMED`/`RELEASED`) y
  los correos de serie pasan a la 008.

Estado: **aprobada** por el usuario (2026-10-03).

## Requisitos funcionales

### 1. Modelo

- Tabla nueva `ClinicalNote`:

  | Campo | Tipo |
  | --- | --- |
  | `id` | cuid |
  | `childId` | FK a `Child`, `Restrict` |
  | `date` | `@db.Date`, el día del trabajo en Chile |
  | `title` | texto |
  | `body` | texto |
  | `sessionId` | `String?`, FK a `Session`, `SetNull` |
  | `guardianNotified` | `Boolean`, si se pidió el correo al crear |
  | `createdAt`, `updatedAt` | timestamps |

  Índice en `(childId, date)`.
- `OutboxEmail` gana `clinicalNoteId String?`, sin FK, igual que `sessionId`: borrar la nota no
  debe romper la fila.
- El borrado es real (sin papelera).

### 2. Endpoints (`/api/panel/*`, `EducatorAuthGuard`)

| Ruta | Respuesta | Errores |
| --- | --- | --- |
| `GET /api/panel/children/:id/notes` | `200 { child, guardian, notes: ClinicalNoteDto[] }`, ordenadas por `date desc, createdAt desc`. | 404 `CHILD_NOT_FOUND` |
| `POST /api/panel/children/:id/notes` | `201 ClinicalNoteDto` | 404 `CHILD_NOT_FOUND`, 422 `NOTE_SESSION_MISMATCH`, 400 validación |
| `PATCH /api/panel/notes/:id` | `200 ClinicalNoteDto` | 404 `NOTE_NOT_FOUND`, 422 `NOTE_SESSION_MISMATCH`, 400 validación |
| `DELETE /api/panel/notes/:id` | `204` | 404 `NOTE_NOT_FOUND` |
| `GET /api/panel/children/:id/notes.pdf` | `200 application/pdf`, con `Content-Disposition: attachment; filename="ficha-<nombre-slug>-<YYYY-MM-DD>.pdf"` | 404 `CHILD_NOT_FOUND` |

- Sin token, todas responden 401 `NO_SESSION`.
- **`ClinicalNoteDto`:** `{ id, childId, date: 'YYYY-MM-DD', title, body, sessionId: string | null, session: { date, time, status } | null, guardianNotified, createdAt, updatedAt }`.
- **Body de `POST`:** `{ date, title, body, sessionId?, notifyGuardian }`. `notifyGuardian` es
  obligatorio y booleano, para que el panel lo pida siempre de forma explícita.
- **Body de `PATCH`:** cualquier subconjunto de `{ date, title, body, sessionId }`. `sessionId:
  null` desvincula la sesión. `notifyGuardian` no se acepta en el `PATCH`.
- **Validación:**
  - `title`: entre 1 y 120 caracteres, con trim.
  - `body`: entre 1 y 10.000 caracteres, con trim.
  - `date`: `YYYY-MM-DD` válida. Se aceptan fechas pasadas y futuras.
- **`sessionId`:** si viene, tiene que ser una sesión del **mismo niño**. Si no, o si no existe,
  responde 422 `NOTE_SESSION_MISMATCH`.
- **Mensajes:** los nuevos van en `src/common/errors/panel-messages.ts`.
- **Detalle del apoderado:** `GET /api/panel/guardians/:id` agrega `notesCount` a cada niño.
- **Notificaciones:** crear, editar o borrar no emite eventos SSE ni avisos en la campana, porque
  lo hace ella misma.

### 3. Correo al apoderado (`CLINICAL_NOTE`)

- **Cuándo se escribe la fila:** con `notifyGuardian: true`, la misma transacción que crea la nota
  escribe una fila `CLINICAL_NOTE` en el outbox, con `recipient = guardian.email` y
  `clinicalNoteId`, y la nota queda con `guardianNotified = true`. Con `false` no escribe nada.
- **Cómo se arma:** el despachador arma el correo con el contenido de la nota **al enviar**, igual
  que con las sesiones. Una corrección hecha antes del despacho llega corregida.
- **Si la nota ya no existe** al despachar, la fila queda `SKIPPED`.
- **No se aplica** la regla de "cita ya empezada": el registro no es una invitación a asistir.
- **Contenido:**
  - Asunto: `Nuevo registro en la ficha de <niño>`.
  - Cuerpo: saludo al apoderado, fecha ("lunes 5 de octubre"), título y texto, con los saltos de
    línea respetados.
  - Sin enlaces.
  - Versión HTML y versión texto, con el layout común de la spec 006.
- **Invariante:** el correo solo habla de ese niño y de ese registro.

### 4. PDF del historial

- **Contenido:**
  - Título "Ficha del alumno" y cuatro campos: **Nombre** y **Edad** del niño, **Educadora**
    (nombre de la educadora autenticada) y **Fecha** (día de la exportación).
  - Debajo, en una línea discreta, nombre y contacto del apoderado.
  - Todos los registros en **orden cronológico ascendente**, cada uno con fecha, título, texto y,
    si tiene sesión vinculada, su fecha y hora.
  - Pie con "<educadora> · Educadora diferencial" y número de página.
- **Estilo** (enmienda del 2026-10-03, inspirada en una hoja "Plan de clase"): marco con borde
  ondulado en cada página, título con letras de colores, campos y registros en bloques pastel
  redondeados, y dibujos vectoriales simples (corazón, estrella, lápiz) que no pisan el texto.
  Todo con la paleta de los frontends; tipografía DM Sans y Newsreader, como el panel (archivos
  `.ttf` en `assets/fonts/`, licencia OFL).
- **Sin registros:** el PDF sale igual, con el texto "Sin registros".
- **Generación:** en el servidor, a partir de un componente React puro (`@react-pdf/renderer`),
  con la paleta de `src/email/theme.ts`.
  - La primera tarea es un spike que confirma que funciona en ESM con `nest build` y Node 24.
  - Si falla, se usa `pdfkit` y se anota en `status.md`.
- **Fechas y horas** en `America/Santiago`.

### 5. Documentación

- `docs/API.md` y `docs/openapi.json` (`pnpm docs:openapi`).
- `test/swagger-coverage.e2e-spec.ts` con las rutas nuevas.
- `CLAUDE.md` de esta app (endpoints, módulo y orden de specs) y `../CLAUDE.md` (hoja de ruta).
- `../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`:
  - Sección nueva "Ficha clínica".
  - Fila `CLINICAL_NOTE` en "Correos".
- `../AGENTS_PRIVATE.md`: reemplazar "Próximamente: ficha por alumno".
- En `CLAUDE.md` de esta app, corregir "la educadora no recibe correo por lo que hace ella
  misma": esta spec agrega un correo que ella misma origina, pero dirigido al apoderado.

## Fuera de alcance

- Que el apoderado vea la ficha en la web pública o desde su cuenta.
- Adjuntos o imágenes.
- Reenviar el correo al editar, o enviarlo después de crear un registro sin correo.
- Historial de versiones de un registro.
- PDF por rango de fechas, firma o membrete con logo.
- Borrar un niño o un apoderado.

## Criterios de aceptación

- [ ] CRUD de notas con los códigos de la tabla. Sin token responde 401. Las notas de un niño no
      aparecen en otro.
- [ ] Un `sessionId` de otro niño, o inexistente, responde 422 `NOTE_SESSION_MISMATCH`.
- [ ] Con `notifyGuardian: true`, `dispatchOnce()` y un sender falso envían 1 correo al email del
      apoderado, con el título y el texto, y la fila queda `SENT`.
- [ ] Con `notifyGuardian: false` no hay fila en el outbox.
- [ ] Editar no agrega filas al outbox.
- [ ] Si la nota se borra antes del despacho, la fila queda `SKIPPED` sin llamar al sender.
- [ ] El PDF responde 200 con `content-type: application/pdf`, el cuerpo empieza con `%PDF` y el
      `filename` es correcto. Con 0 notas también responde 200.
- [ ] `GET /api/panel/guardians/:id` trae `notesCount` por niño.
- [ ] Tests unitarios de la plantilla `CLINICAL_NOTE`, del armado del mensaje y del render del PDF.
- [ ] Los e2e existentes pasan. `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` en verde.
