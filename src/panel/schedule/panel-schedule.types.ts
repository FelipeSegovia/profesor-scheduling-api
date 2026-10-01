import type { WorkDayView } from '../../domain/schedule.js';

export interface PanelPreferencesResponse {
  workWeek: WorkDayView[];
  confirmationDeadlineHours: number;
  seriesNoticeHours: number;
  bookingHorizonWeeks: number;
}

export interface UpdateTemplateResult {
  workWeek: WorkDayView[];
  /** Sesiones activas futuras cuya hora quedó fuera de la plantilla nueva (no se tocan, solo se informa). */
  orphanSessions: number;
}
