/**
 * Traducción entre la plantilla semanal como la edita la educadora (rango
 * `start`/`end` por día) y las filas `TemplateSlot` (una por hora) que
 * persiste la base. Puro, sin Nest ni BD. Ver `.specs/004-panel-educadora/plan.md`.
 */

export interface WorkDayInput {
  weekday: number;
  available: boolean;
  start: string | null;
  end: string | null;
}

export interface TemplateRow {
  weekday: number;
  time: string;
}

function parseHour(time: string): number {
  return Number(time.slice(0, 2));
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Un cupo de 1 hora por cada hora entera entre `start` (inclusive) y `end`
 * (exclusivo). Vacío si falta un extremo o el rango es vacío/invertido.
 */
export function expandRangeToHours(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const startHour = parseHour(start);
  const endHour = parseHour(end);
  if (endHour <= startHour) return [];
  return Array.from({ length: endHour - startHour }, (_, i) => formatHour(startHour + i));
}

/**
 * Inversa aproximada de `expandRangeToHours`: el rango que cubre `times`
 * (min como inicio, una hora después del max como fin). No asume que `times`
 * sea contiguo — para eso está `isContiguousHourRange`.
 */
export function collapseHoursToRange(times: string[]): { start: string; end: string } | null {
  if (times.length === 0) return null;
  const hours = times.map(parseHour).sort((a, b) => a - b);
  return { start: formatHour(hours[0]!), end: formatHour(hours[hours.length - 1]! + 1) };
}

/** True si `times` son horas consecutivas sin huecos (orden no importa). */
export function isContiguousHourRange(times: string[]): boolean {
  if (times.length === 0) return true;
  const hours = [...new Set(times.map(parseHour))].sort((a, b) => a - b);
  return hours.every((h, i) => i === 0 || h === hours[i - 1]! + 1);
}

/** `workWeek` (editado por la educadora) → filas `TemplateSlot` a persistir. */
export function templateRowsFromWorkWeek(workWeek: WorkDayInput[]): TemplateRow[] {
  return workWeek
    .filter((day) => day.available)
    .flatMap((day) => expandRangeToHours(day.start, day.end).map((time) => ({ weekday: day.weekday, time })));
}

export const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export interface WorkDayView {
  weekday: number;
  label: string;
  available: boolean;
  start: string | null;
  end: string | null;
  times: string[];
  contiguous: boolean;
}

/**
 * Filas `TemplateSlot` (agrupadas por día) → `workWeek` para `GET /panel/preferences`.
 * Devuelve las 7 entradas (domingo a sábado), con `available: false` para los
 * días sin ninguna fila.
 */
export function workWeekFromTemplateRows(rows: TemplateRow[]): WorkDayView[] {
  return WEEKDAY_LABELS.map((label, weekday) => {
    const times = rows
      .filter((r) => r.weekday === weekday)
      .map((r) => r.time)
      .sort();
    if (times.length === 0) {
      return { weekday, label, available: false, start: null, end: null, times: [], contiguous: true };
    }
    const range = collapseHoursToRange(times)!;
    return {
      weekday,
      label,
      available: true,
      start: range.start,
      end: range.end,
      times,
      contiguous: isContiguousHourRange(times),
    };
  });
}
