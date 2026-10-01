import type { PanelSessionDto } from '../panel.dto.js';

export type SkipReason = 'OCCUPIED' | 'DAY_BLOCKED' | 'SLOT_BLOCKED' | 'PAST';

export interface SkippedSeriesDate {
  date: string;
  reason: SkipReason;
}

export interface CreateSeriesResult {
  seriesId: string;
  created: PanelSessionDto[];
  skipped: SkippedSeriesDate[];
}
