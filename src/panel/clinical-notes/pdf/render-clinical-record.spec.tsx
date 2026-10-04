import { describe, expect, it } from 'vitest';
import type { ClinicalRecordData } from './clinical-record-document.js';
import { pdfFilename, renderClinicalRecord } from './render-clinical-record.js';

const base: ClinicalRecordData = {
  child: { name: 'Tomás', age: 7 },
  guardian: {
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '+56911112222',
  },
  educator: { name: 'Loreto Castillo' },
  exportedOn: '2026-10-03',
  notes: [],
};

const isPdf = (buffer: Buffer) => buffer.subarray(0, 4).toString() === '%PDF';

/** Páginas del PDF, leídas del `/Count` del árbol de páginas. */
const pageCount = (buffer: Buffer) =>
  Number(/\/Count (\d+)/.exec(buffer.toString('latin1'))?.[1]);

describe('renderClinicalRecord', () => {
  it('genera un PDF sin registros', async () => {
    expect(isPdf(await renderClinicalRecord(base))).toBe(true);
  });

  it('embebe DM Sans y Newsreader, no las fuentes integradas', async () => {
    const pdf = (await renderClinicalRecord(base)).toString('latin1');
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+DMSans/);
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+Newsreader/);
    expect(pdf).not.toContain('/BaseFont /Helvetica');
  });

  it('genera un PDF con registros, con y sin sesión vinculada', async () => {
    const buffer = await renderClinicalRecord({
      ...base,
      notes: [
        {
          date: '2026-09-28',
          title: 'Primera sesión',
          body: 'Evaluación inicial.\nÑandú, camión, pingüino.',
          session: { date: '2026-09-28', time: '19:00' },
        },
        {
          date: '2026-10-05',
          title: 'Lectura',
          body: 'Sílabas.',
          session: null,
        },
      ],
    });
    expect(isPdf(buffer)).toBe(true);
  });

  it('un texto muy largo cruza de página sin fallar', async () => {
    const short = await renderClinicalRecord({
      ...base,
      notes: [
        { date: '2026-10-05', title: 'Corto', body: 'Hola.', session: null },
      ],
    });
    const long = await renderClinicalRecord({
      ...base,
      notes: [
        {
          date: '2026-10-05',
          title: 'Largo',
          body: 'Línea de trabajo con varias palabras.\n'.repeat(400),
          session: null,
        },
      ],
    });
    expect(isPdf(long)).toBe(true);
    expect(long.length).toBeGreaterThan(short.length);
  });
});

describe('renderClinicalRecord con historiales largos', () => {
  // Regresión: un `lineHeight` sin `fontSize` en el mismo estilo se calculaba
  // sobre 18 pt y no sobre el cuerpo de texto: 120 líneas ocupaban 6 páginas.
  it('el interlineado del texto sigue al tamaño de letra', async () => {
    const buffer = await renderClinicalRecord({
      ...base,
      notes: [
        {
          date: '2026-10-05',
          title: 'Largo',
          body: 'Línea de trabajo con varias palabras.\n'.repeat(120),
          session: null,
        },
      ],
    });
    expect(pageCount(buffer)).toBe(4);
  });

  // Regresión: un registro largo que cruza de página rompía el render
  // (ver el comentario sobre `lineHeight` en `clinical-record-document.tsx`).
  it.each([60, 400, 2000])('un registro de %i líneas', async (lines) => {
    const buffer = await renderClinicalRecord({
      ...base,
      notes: [
        {
          date: '2026-10-05',
          title: 'Largo',
          body: 'Línea de trabajo con varias palabras.\n'.repeat(lines),
          session: { date: '2026-10-05', time: '19:00' },
        },
      ],
    });
    expect(isPdf(buffer)).toBe(true);
  });

  it('muchos registros', async () => {
    const buffer = await renderClinicalRecord({
      ...base,
      notes: Array.from({ length: 80 }, (_, i) => ({
        date: '2026-10-05',
        title: `Registro ${i + 1}`,
        body: 'Trabajamos varias cosas.\nObservaciones del día.\n'.repeat(5),
        session: i % 2 === 0 ? { date: '2026-10-05', time: '19:00' } : null,
      })),
    });
    expect(isPdf(buffer)).toBe(true);
  });
});

describe('pdfFilename', () => {
  it('pasa el nombre a ASCII con guiones', () => {
    expect(pdfFilename('Tomás Núñez', '2026-10-03')).toBe(
      'ficha-tomas-nunez-2026-10-03.pdf',
    );
    expect(pdfFilename('  María José  ', '2026-10-03')).toBe(
      'ficha-maria-jose-2026-10-03.pdf',
    );
  });

  it('no deja caracteres peligrosos para el header', () => {
    expect(pdfFilename('Ana "la" /\\ ../x', '2026-10-03')).toBe(
      'ficha-ana-la-x-2026-10-03.pdf',
    );
  });

  it('usa un nombre por defecto si no queda nada', () => {
    expect(pdfFilename('💥', '2026-10-03')).toBe('ficha-nino-2026-10-03.pdf');
  });
});
