import type { PanelSessionDto } from '../panel.dto.js';

export interface PanelGuardianListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  childrenCount: number;
  activeSessions: number;
}

export interface PanelChildDto {
  id: string;
  guardianId: string;
  name: string;
  age: number;
  /** Registros de su ficha clínica. Solo viene en `GET /guardians/:id` (spec 007). */
  notesCount?: number;
}

export interface PanelGuardianDto {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface PanelGuardianDetail {
  guardian: PanelGuardianDto;
  children: PanelChildDto[];
  sessions: PanelSessionDto[];
}
