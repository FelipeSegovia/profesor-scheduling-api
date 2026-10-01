import type { SlotCell } from '../../slots/slot-grid.js';

export interface PanelAgendaDay {
  date: string;
  weekday: number;
  dayBlocked: boolean;
  cells: SlotCell[];
}

export interface PanelAgendaResponse {
  weekStart: string;
  days: PanelAgendaDay[];
}
