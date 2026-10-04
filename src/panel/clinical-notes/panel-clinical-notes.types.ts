import type { SessionStatus } from '../../generated/prisma/enums.js';
import type {
  PanelChildDto,
  PanelGuardianDto,
} from '../people/panel-people.types.js';

/** Sesión de la agenda a la que está vinculado un registro. */
export interface ClinicalNoteSessionDto {
  /** `YYYY-MM-DD`, Chile. */
  date: string;
  /** `HH:mm`, Chile. */
  time: string;
  status: SessionStatus;
}

export interface ClinicalNoteDto {
  id: string;
  childId: string;
  /** Día del registro, `YYYY-MM-DD`. */
  date: string;
  title: string;
  body: string;
  sessionId: string | null;
  session: ClinicalNoteSessionDto | null;
  /** Se pidió enviar el registro al apoderado al crearlo. */
  guardianNotified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChildNotesResponse {
  child: PanelChildDto;
  guardian: PanelGuardianDto;
  /** Del más reciente al más antiguo. */
  notes: ClinicalNoteDto[];
}
