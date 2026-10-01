import type { SessionStatus } from '../generated/prisma/enums.js';

/**
 * Estado de un cupo para el panel de la educadora. A diferencia de `SlotView`
 * (contrato público congelado, que solo distingue `available`/`past`), el
 * panel necesita saber SI el cupo está ocupado, bloqueado por día, bloqueado
 * puntual o fuera del horizonte de reserva, para ofrecer la acción correcta
 * (mover/cancelar vs. desbloquear vs. nada). Ver `.specs/004-panel-educadora/plan.md`.
 */
export type SlotState = 'FREE' | 'BOOKED' | 'BLOCKED_DAY' | 'BLOCKED_SLOT' | 'BEYOND_HORIZON';

export interface SlotCellSession {
  id: string;
  status: SessionStatus;
  childId: string;
  guardianId: string;
  childName: string;
  guardianName: string;
  helpRequest?: string;
  seriesId?: string;
}

export interface SlotCell {
  date: string;
  time: string;
  startsAt: string;
  past: boolean;
  state: SlotState;
  /**
   * Redundante con `state === 'BLOCKED_DAY'` salvo cuando el día tiene además
   * una sesión activa (`state` resuelve a `BOOKED`, que tiene precedencia).
   * El contrato público (`SlotView`) necesita esta bandera cruda para omitir
   * el día completo sin importar la ocupación — ver `buildWeekSlots`.
   */
  dayBlocked: boolean;
  session?: SlotCellSession;
}

/**
 * Precedencia deliberada: un cupo con sesión activa dentro de un día bloqueado
 * es `BOOKED`, no `BLOCKED_DAY` — la sesión existe y hay que poder moverla o
 * cancelarla, no que desaparezca de la agenda. Un bloqueo de cupo puntual solo
 * importa si no hay ya una sesión ahí.
 */
export function resolveSlotState(input: {
  occupied: boolean;
  dayBlocked: boolean;
  slotBlocked: boolean;
  beyondHorizon: boolean;
}): SlotState {
  if (input.occupied) return 'BOOKED';
  if (input.dayBlocked) return 'BLOCKED_DAY';
  if (input.slotBlocked) return 'BLOCKED_SLOT';
  if (input.beyondHorizon) return 'BEYOND_HORIZON';
  return 'FREE';
}
