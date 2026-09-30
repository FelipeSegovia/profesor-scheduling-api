/**
 * Forma exacta del contrato público congelado
 * (`public-parents-scheduling-web/src/domain/types.ts`, `SlotView`).
 */
export interface SlotView {
  date: string;
  time: string;
  startsAt: string;
  available: boolean;
  past: boolean;
}
