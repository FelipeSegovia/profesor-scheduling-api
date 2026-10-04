import { renderToBuffer } from '@react-pdf/renderer';
import {
  ClinicalRecordDocument,
  type ClinicalRecordData,
} from './clinical-record-document.js';
import { registerPdfFonts } from './fonts.js';

registerPdfFonts();

/** Genera el PDF del historial de un niño (spec 007). */
export function renderClinicalRecord(
  data: ClinicalRecordData,
): Promise<Buffer> {
  return renderToBuffer(<ClinicalRecordDocument {...data} />);
}

/**
 * Nombre del archivo descargado: `ficha-<nombre>-<YYYY-MM-DD>.pdf`. El nombre
 * se pasa a ASCII (sin tildes ni eñes) para que `Content-Disposition` no
 * necesite `filename*`.
 */
export function pdfFilename(childName: string, todayYmd: string): string {
  const slug = childName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `ficha-${slug || 'nino'}-${todayYmd}.pdf`;
}
