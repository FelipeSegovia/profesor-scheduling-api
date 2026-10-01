import { Injectable } from '@nestjs/common';
import { weekDaysMonSunYmd, weekdayOf } from '../../domain/time.js';
import { SlotsService } from '../../slots/slots.service.js';
import type { PanelAgendaResponse } from './panel-agenda.types.js';

@Injectable()
export class PanelAgendaService {
  constructor(private readonly slots: SlotsService) {}

  async getWeek(weekStart: string): Promise<PanelAgendaResponse> {
    const grid = await this.slots.buildWeekGrid(weekStart);
    const days = weekDaysMonSunYmd(weekStart).map((date) => {
      const cells = grid.filter((c) => c.date === date);
      return {
        date,
        weekday: weekdayOf(date),
        dayBlocked: cells.some((c) => c.dayBlocked),
        cells,
      };
    });

    return { weekStart, days };
  }
}
