import { SessionStatus } from '../generated/prisma/enums.js';

/**
 * Única traducción de idioma del sistema: el contrato público congelado
 * transporta el estado de la sesión como literal en español
 * (`public-parents-scheduling-web/src/domain/types.ts`, `SessionStatus`).
 * En cualquier otro lugar del backend el estado es el enum de Prisma, en
 * inglés — ver `.specs/001-fundaciones-dominio/spec.md`, sección 3.
 */
export const STATUS_TO_WIRE = {
  PENDING: 'pendiente',
  CONFIRMED: 'confirmada',
  NOT_CONFIRMED: 'no_confirmada',
  CANCELLED: 'cancelada',
} as const satisfies Record<SessionStatus, string>;

export type WireSessionStatus = (typeof STATUS_TO_WIRE)[SessionStatus];

/**
 * Inverso de `STATUS_TO_WIRE`, derivado del primero (no escrito a mano) para
 * que las dos direcciones no puedan discrepar.
 */
export const WIRE_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_TO_WIRE).map(([status, wire]) => [wire, status]),
) as Record<WireSessionStatus, SessionStatus>;

export function toWireStatus(status: SessionStatus): WireSessionStatus {
  return STATUS_TO_WIRE[status];
}

export function fromWireStatus(wire: WireSessionStatus): SessionStatus {
  return WIRE_TO_STATUS[wire];
}
