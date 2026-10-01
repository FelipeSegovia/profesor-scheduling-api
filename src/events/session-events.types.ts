import type { Actor } from '../generated/prisma/enums.js';

/**
 * Alineado con `ActivityKind` (`src/domain/activity.ts`) más `MOVED`, que la
 * campana no deriva (una sesión movida sigue siendo `PENDING`/`CONFIRMED`) pero
 * sí sirve para refrescar otras pestañas. `NOT_CONFIRMED` lo emitirá el job de
 * vencimiento (spec futura).
 */
export type SessionEventKind = 'CREATED' | 'CONFIRMED' | 'CANCELLED' | 'NOT_CONFIRMED' | 'MOVED';

/** Cambio de una sesión, tal como viaja por el stream `GET /api/panel/events`. */
export interface SessionEvent {
  /**
   * `${sessionId}:${kind}`. `MOVED` puede repetirse, así que no es único en el tiempo.
   * No coincide con `ActivityItem.id` (el alta de la campana usa `:created`).
   */
  id: string;
  kind: SessionEventKind;
  sessionId: string;
  childName: string;
  /** ISO. Inicio de la cita afectada. */
  startsAt: string;
  actor: Actor;
  /** ISO. Momento del cambio. */
  at: string;
}
