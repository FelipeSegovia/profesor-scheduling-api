import type { ActivityItem } from '../../domain/activity.js';
import type { SlotCell } from '../../slots/slot-grid.js';
import type { PanelSessionDto } from '../panel.dto.js';

export interface PanelStats {
  today: number;
  confirmed: number;
  pending: number;
  families: number;
}

export interface PanelSummaryResponse {
  today: string;
  weekStart: string;
  educator: { id: string; name: string; email: string };
  stats: PanelStats;
  todaySessions: PanelSessionDto[];
  attention: PanelSessionDto[];
  activity: ActivityItem[];
  nextFreeSlot: SlotCell | null;
}
