import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';

/**
 * Familias del PDF: las mismas del panel (DM Sans para el texto, Newsreader
 * para los títulos). Se usan en `fontFamily` de los estilos.
 */
export const pdfFonts = { sans: 'DM Sans', serif: 'Newsreader' } as const;

// Los `.ttf` viven en `assets/fonts/` en la raíz de la app, fuera de `src/`.
// `nest build` deja este módulo en `dist/panel/clinical-notes/pdf/`, a la misma
// profundidad que en `src/`, así que la ruta relativa sirve en los dos. Son
// instancias estáticas, no las variables: fontkit no elige pesos de una fuente
// variable. Cubren el español, pero no emojis.
const fontFile = (name: string) =>
  fileURLToPath(new URL(`../../../../assets/fonts/${name}`, import.meta.url));

let registered = false;

/** Registra las fuentes en `@react-pdf/renderer` (global). Idempotente. */
export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: pdfFonts.sans,
    fonts: [
      { src: fontFile('DMSans-Regular.ttf'), fontWeight: 400 },
      { src: fontFile('DMSans-Medium.ttf'), fontWeight: 500 },
      { src: fontFile('DMSans-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: pdfFonts.serif,
    fonts: [
      { src: fontFile('Newsreader-Regular.ttf'), fontWeight: 400 },
      { src: fontFile('Newsreader-SemiBold.ttf'), fontWeight: 600 },
    ],
  });
  // Sin guiones de corte: la separación silábica por defecto es la del inglés.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
