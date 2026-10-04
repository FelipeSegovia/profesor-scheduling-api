# Tasks: Ficha clínica por niño

Orden de ejecución de [`plan.md`](./plan.md). Cada tarea deja el repo en verde con `pnpm lint &&
pnpm build`. Al cerrar cada tarea, actualizar [`status.md`](./status.md).

## Base técnica

1. [x] **Spike del PDF.**
   - Instalar `@react-pdf/renderer`.
   - Crear `pdf/render-clinical-record.ts` con un documento mínimo y un `.spec.tsx` que verifique
     el prefijo `%PDF`.
   - Deben pasar `pnpm test`, `pnpm lint` y `pnpm build`, y `node` debe poder importar el módulo
     desde `dist/` y renderizar.
   - Si algo falla, **parar y consultar** antes de cambiar a `pdfkit`.
2. [x] **Migración `clinical_notes`.**
   - Modelo `ClinicalNote`, relaciones inversas y `OutboxEmail.clinicalNoteId`.
   - Crear con `--create-only` y revisar el SQL.
   - Aplicar en dev y después correr `pnpm prisma generate`.
   - Los e2e existentes deben pasar sin cambios.

## Contenido (puro, sin Nest ni BD)

3. [x] **`formatCalendarDate`** en `src/email/format.ts`, con tests en varias `TZ`.
4. [x] **Correo `CLINICAL_NOTE`.**
   - Variante en `EmailMessage`.
   - Plantilla `templates/clinical-note.tsx`.
   - `case` en `render-email.tsx`.
   - Tests en `render-email.spec.tsx`.
5. [x] **`buildClinicalNoteMessage`** en `outbox-message.ts`, con tests (`null` → `skip`, nota →
   `send`).
6. [x] **Documento PDF completo** (`clinical-record-document.tsx`) y `pdfFilename`.
   - Tests con 0 y N notas, y del slug.

## Backend

7. [x] **Outbox.**
   - `OutboxKind.CLINICAL_NOTE`.
   - `write({ clinicalNoteId })`.
   - Rama `CLINICAL_NOTE` en `OutboxDispatcherService.processRow`.
8. [x] **Módulo `src/panel/clinical-notes/`.**
   - Schemas, types, service y controller con Swagger.
   - Mensajes en `panel-messages.ts`.
   - Registro en `PANEL_CONTROLLERS`.
   - E2e del CRUD y del outbox en `test/panel-clinical-notes.e2e-spec.ts`.
9. [x] **Ruta del PDF.**
   - `GET children/:id/notes.pdf` con `StreamableFile`.
   - E2e de headers, `%PDF`, 0 notas y 404.
10. [x] **`notesCount`** en `GET /api/panel/guardians/:id`, con su e2e.
11. [x] **Cobertura Swagger.** Las 5 rutas en `test/swagger-coverage.e2e-spec.ts`.

## Documentación y cierre

12. [x] **Documentación.**
    - `docs/API.md` y `pnpm docs:openapi`.
    - `CLAUDE.md` de la app y `../CLAUDE.md`.
    - `../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md` y `../AGENTS_PRIVATE.md`.
13. [x] **Cierre.**
    - `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` en verde.
    - Prueba manual contra `dist/main` en un puerto libre (sin tocar 3000, 5173 ni 5174):
      1. Crear una nota con correo y verla en el log del sender de consola.
      2. Descargar el PDF con `curl` y abrirlo.

## Enmienda: plantilla del PDF

14. [x] **Rediseño de la plantilla del PDF** (spec §4, enmienda del 2026-10-03).
    - Fuentes estáticas DM Sans (400/500/700) y Newsreader (400/600) en `assets/fonts/`, con su
      `OFL`, registradas en `pdf/fonts.ts`.
    - Colores que faltan en `theme.ts` (`muted`, `success(Soft)`, `warning(Soft)`).
    - `pdf/decorations.tsx` (marco ondulado, corazón, estrella, lápiz) y nuevo layout en
      `clinical-record-document.tsx` con Nombre, Educadora, Edad y Fecha.
    - `exportPdf` y el controlador pasan el nombre de la educadora autenticada.
    - Tests del render (fuentes embebidas y regresiones de páginas largas), revisión visual de
      PDFs reales y prueba manual contra `dist/main`.
    - `REQUERIMIENTOS_FUNCIONALES.md` y `CLAUDE.md`.
