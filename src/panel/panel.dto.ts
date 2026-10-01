import type { SessionStatus } from '../generated/prisma/enums.js';
import { toChileDateString, toChileTimeString } from '../domain/time.js';

export interface PanelSessionDto {
  id: string;
  date: string;
  time: string;
  childId: string;
  guardianId: string;
  childName: string;
  guardianName: string;
  status: SessionStatus;
  helpRequest?: string;
  seriesId?: string;
}

interface SessionWithNames {
  id: string;
  startsAt: Date;
  childId: string;
  guardianId: string;
  status: SessionStatus;
  helpRequest: string | null;
  seriesId: string | null;
  child: { name: string };
  guardian: { name: string };
}

/**
 * Mapeo compartido `Session` (+ `child`/`guardian` incluidos) → forma del
 * panel. A diferencia de `sessionToDto` (`src/common/dto.ts`, contrato público
 * congelado), este no traduce `status` al literal español: el panel no está
 * congelado y viaja el enum tal cual. Ver `.specs/004-panel-educadora/spec.md`.
 */
export function sessionToPanelDto(session: SessionWithNames): PanelSessionDto {
  return {
    id: session.id,
    date: toChileDateString(session.startsAt),
    time: toChileTimeString(session.startsAt),
    childId: session.childId,
    guardianId: session.guardianId,
    childName: session.child.name,
    guardianName: session.guardian.name,
    status: session.status,
    helpRequest: session.helpRequest ?? undefined,
    seriesId: session.seriesId ?? undefined,
  };
}
