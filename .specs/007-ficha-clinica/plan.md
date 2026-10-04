# Plan: Ficha clínica por niño

Cómo se implementa [`spec.md`](./spec.md) (aprobada el 2026-10-03).

## Módulo nuevo: `src/panel/clinical-notes/`

Sigue el patrón de `src/panel/people/`.

| Archivo | Contenido |
| --- | --- |
| `panel-clinical-notes.controller.ts` | `@ApiTags('panel-clinical-notes') @ApiBearerAuth() @UseGuards(EducatorAuthGuard) @Controller('panel')`. Las 5 rutas de la spec, cada una con `@ApiOperation` y `@ApiResponse` por resultado. |
| `panel-clinical-notes.service.ts` | `listForChild(childId)`, `create(childId, body)`, `update(id, body)`, `remove(id)` y `exportPdf(childId, now)`. |
| `panel-clinical-notes.schemas.ts` | Zod: `createNoteSchema` y `updateNoteSchema` (este último `.partial()` y sin `notifyGuardian`). Fecha con la misma regex que `panel-schedule.schemas.ts` más un chequeo de fecha real. |
| `panel-clinical-notes.types.ts` | `ClinicalNoteDto` y `ChildNotesResponse`. |
| `pdf/clinical-record-document.tsx` | El componente del PDF, puro. |
| `pdf/render-clinical-record.ts` | `renderClinicalRecord(data): Promise<Buffer>` con `renderToBuffer`, y `pdfFilename(childName, today)`. |

- **Registro del controlador:** se agrega a `PANEL_CONTROLLERS` en `src/panel/panel.module.ts`,
  que también define a qué rutas se aplica `EducatorContextMiddleware`.
- **Rutas y orden de declaración:** `GET children/:id/notes.pdf` y `GET children/:id/notes` son
  rutas distintas. Igual se declara primero `notes.pdf`, para que el router de Express no las
  confunda.

## Fechas

- `ClinicalNote.date` es `@db.Date`. Se escribe con `chileDateToColumn` y se lee con
  `columnToChileDate` (`src/domain/time.ts`), los únicos helpers autorizados para esa
  conversión.
- Para mostrar la fecha en el correo y en el PDF, se agrega `formatCalendarDate(ymd)` a
  `src/email/format.ts`: "lunes 5 de octubre", con `parseYmdLocal` o un mediodía UTC, sin pasar
  por un instante.
  - `formatSessionDate` recibe un instante y se convertiría a Chile, lo que corre el día. Por
    eso no sirve aquí.
  - Se prueba con `TZ=UTC` y con `TZ=Asia/Tokyo`, igual que en la 006.

## Crear y validar

- **Transacción:** `create` corre dentro de `prisma.$transaction`.
  1. Carga el niño con su apoderado. Si no existe, 404 `CHILD_NOT_FOUND`.
  2. Si viene `sessionId`, busca la sesión con `findFirst({ id, childId })`. Si no la encuentra,
     422 `NOTE_SESSION_MISMATCH`.
  3. Crea la nota con `guardianNotified = notifyGuardian`.
  4. Si hay que notificar, llama a `outbox.write({ kind: CLINICAL_NOTE, recipient:
     guardian.email, clinicalNoteId }, tx)`.
- **`update`:** repite la validación de `sessionId` cuando viene (`null` desvincula) y nunca toca
  el outbox.
- **`remove`:** `delete`. Si Prisma lanza P2025, responde 404 `NOTE_NOT_FOUND`.
- **Mensajes nuevos** en `panel-messages.ts`:
  - `NOTE_NOT_FOUND`: "No encontramos ese registro."
  - `NOTE_SESSION_MISMATCH`: "La sesión elegida no es de este niño."
  - `CHILD_NOT_FOUND` ya existe.
- **Respuesta:** el DTO incluye `session: { date, time, status } | null`, con
  `toChileDateString` y `toChileTimeString` sobre `startsAt`.

## Outbox y correo

- **Migración `clinical_notes`** (`--create-only`, revisar el SQL, aplicar y luego
  `pnpm prisma generate`):
  - Tabla `ClinicalNote` con sus FK: `childId` con `RESTRICT` y `sessionId` con `SET NULL`.
  - Índice en `(childId, date)`.
  - Columna `OutboxEmail.clinicalNoteId text NULL`.
  - Relaciones inversas `notes` en `Child` y `Session`.
- **`outbox.service.ts`:**
  - Agrega `OutboxKind.CLINICAL_NOTE`, con el comentario de la spec 007.
  - `write()` acepta `clinicalNoteId?`.
  - Se corrige el comentario de `OutboxStatus.SKIPPED`, que ahora también cubre las notas
    borradas.
- **`outbox-message.ts`:** función pura nueva.

  ```ts
  export interface ClinicalNoteForEmail {
    date: Date; title: string; body: string;
    child: { name: string; guardian: { name: string } };
  }
  export function buildClinicalNoteMessage(note: ClinicalNoteForEmail | null): MessageDecision
  ```

  - Con `null` devuelve `skip` con `'clinical note deleted'`.
  - Si no, `send` con `{ kind: 'CLINICAL_NOTE', childName, guardianName, date: columnToChileDate(note.date), title, body }`.
- **`outbox-dispatcher.service.ts` (`processRow`):** si `row.kind === CLINICAL_NOTE`, carga la
  nota con `findUnique({ where: { id: row.clinicalNoteId ?? '' }, include: { child: { include: { guardian: true } } } })`
  y usa `buildClinicalNoteMessage`. Si no, sigue el camino actual. El resto (render, envío,
  backoff, `SENT`) no cambia.
- **`email-message.ts`:** variante
  `CLINICAL_NOTE: { childName, guardianName, date: string /* YYYY-MM-DD */, title, body }`.
- **`templates/clinical-note.tsx`:**
  - Usa `Layout`, `Title` ("Nuevo registro en la ficha de <niño>"), `Paragraph` con el saludo
    ("Hola <apoderado>, Loreto agregó un registro del <fecha> a la ficha de <niño>.") y un bloque
    `secondary` con el título en negrita y el cuerpo.
  - El cuerpo se divide por `\n` en párrafos (o lleva `white-space: pre-wrap`), para que también
    salga bien en la versión texto.
- **`render-email.tsx`:** agrega el `case 'CLINICAL_NOTE'`. Asunto: `Nuevo registro en la ficha
  de <niño>`.

## PDF

- **Dependencia:** `@react-pdf/renderer`, que trae React propio como peer. Ya está React 19.3, así
  que hay que verificar que la versión lo soporte.
- **Spike (tarea 1), con `renderToBuffer`:**
  - Un documento mínimo renderiza desde `pnpm test` (vitest, `.spec.tsx`), desde `nest build` y
    con `node dist/...`.
  - `pnpm lint` en verde.
  - Si falla en ESM o en el build, **parar y consultar**. La alternativa es `pdfkit` con una
    función imperativa.
- **Documento:**
  - `Page size="A4"`, con márgenes de 40 pt. Fuentes integradas: `Helvetica` para el texto y
    `Times-Roman` para los títulos, con el mismo espíritu sans/serif que el correo. Colores de
    `src/email/theme.ts`.
  - Encabezado: "Ficha de <niño>", edad, apoderado (nombre, email y teléfono) y "Exportado el
    <fecha>".
  - Registros en orden `date asc, createdAt asc`, cada uno con `wrap={false}` en el bloque de
    título y `wrap` en el cuerpo, para que un texto largo cruce de página.
  - Pie `fixed` con "Loreto Castillo · Educadora diferencial" y `Página X de Y` (`render` de
    `Text`).
- **Controlador:**

  ```ts
  @Get('children/:id/notes.pdf')
  @ApiProduces('application/pdf')
  async pdf(@Param('id') id: string): Promise<StreamableFile> {
    const { buffer, filename } = await this.service.exportPdf(id, new Date());
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
  ```

  - **Nombre del archivo:** `ficha-<slug>-<YYYY-MM-DD>.pdf`. El slug sale del nombre normalizado
    (sin tildes, en minúsculas, con guiones), así se evita codificar `filename*`.
  - **Errores:** con `StreamableFile`, un 404 sale como JSON por el filtro global, porque se lanza
    antes de devolver el archivo.

## `notesCount` en el detalle del apoderado

En `PanelPeopleService.getGuardian`, `child.findMany({ include: { _count: { select: { notes:
true } } } })`, y `PanelChildDto` gana `notesCount?: number`. Es opcional porque `createChild` y
`updateChild` también devuelven `PanelChildDto` y no lo necesitan. El tipo se documenta en
`API.md`.

## Tests

- **Unitarios:**
  - `outbox-message.spec.ts`: casos `CLINICAL_NOTE` (nota `null` y nota existente).
  - `render-email.spec.tsx`: asunto, título, cuerpo con saltos de línea en el texto, fecha
    calendario, y que no aparezca nada que no se le pasó.
  - `format.spec.ts`: `formatCalendarDate` con varias `TZ`.
  - `clinical-record-document.spec.tsx`: el buffer empieza con `%PDF`, con 0 y con N notas.
  - `pdfFilename`: tildes, espacios y ñ.
- **E2E**, en `test/panel-clinical-notes.e2e-spec.ts` (setup como `panel-people.e2e-spec.ts`,
  `createTestApp({ emailSender: fake })`):
  - CRUD, 401, 404, 422 y validación 400.
  - Aislamiento entre niños.
  - Outbox con `notifyGuardian` en `true` y en `false`: `dispatchOnce` entrega 1 correo y la fila
    queda `SENT`.
  - Editar antes del despacho: llega el texto corregido y no se agregan filas.
  - Borrar antes del despacho: la fila queda `SKIPPED` y `fake.sent` vacío.
  - PDF: 200, headers, `%PDF` y el caso de 0 notas. Con supertest hay que usar
    `.buffer(true).parse(binaryParser)` para leer el cuerpo binario.
  - `notesCount` en `GET /guardians/:id`.
- **`test/swagger-coverage.e2e-spec.ts`:** las 5 operaciones con el tag `panel-clinical-notes`.

## Documentación

Según el requisito 5 de la spec:
- `docs/API.md` con una sección "Ficha clínica" y la fila del correo `CLINICAL_NOTE`.
- `pnpm docs:openapi`.
- `CLAUDE.md` de la app: tabla de endpoints del panel, párrafo de correo (la educadora sí origina
  `CLINICAL_NOTE`, pero dirigido al apoderado) y orden de specs (007 ficha, 008 vencimiento).
- `../CLAUDE.md`.
- `../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`.
- `../AGENTS_PRIVATE.md`.
