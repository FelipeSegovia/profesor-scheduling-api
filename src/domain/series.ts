import { addDays, format } from 'date-fns';
import { slotStartsAtIso, weekdayOf } from './time.js';

export interface SeriesInput {
  weekday: number;
  time: string;
  startDate: string;
  endDate: string;
}

export interface SeriesDate {
  date: string;
  startsAt: string;
}

/** Tope defensivo: una serie de más de dos años sería un error de captura, no un caso real. */
export const MAX_SERIES_SESSIONS = 104;

/**
 * Todas las ocurrencias de `weekday` entre `startDate` y `endDate`, ambos
 * inclusive, con su `startsAt` a la hora dada. Puro: no consulta ocupación ni
 * bloqueos (eso lo hace el servicio, que filtra antes de escribir). Ver
 * `.specs/004-panel-educadora/plan.md`.
 */
export function expandSeriesDates(input: SeriesInput): SeriesDate[] {
  const dates: SeriesDate[] = [];
  let cursor = input.startDate;
  let safety = 0;

  while (cursor <= input.endDate && safety < MAX_SERIES_SESSIONS * 7 + 7) {
    if (weekdayOf(cursor) === input.weekday) {
      dates.push({ date: cursor, startsAt: slotStartsAtIso(cursor, input.time) });
    }
    const [y, m, d] = cursor.split('-').map(Number);
    cursor = format(addDays(new Date(y!, m! - 1, d!, 12), 1), 'yyyy-MM-dd');
    safety += 1;
  }

  return dates;
}
