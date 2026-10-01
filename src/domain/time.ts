import { addDays, format, getDay, isBefore, parseISO, startOfWeek } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Portado de `public-parents-scheduling-web/src/domain/booking.ts`. El MVP
 * asume una sola zona horaria (`docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`).
 */
export const TIMEZONE = 'America/Santiago';

/** Parse YYYY-MM-DD into a Date whose local Y/M/D match (para cálculos de calendario). */
function parseYmdAsLocalParts(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Instante UTC (ISO) del inicio de un cupo dado su día y hora en Chile. */
export function slotStartsAtIso(dateYmd: string, timeHm: string): string {
  return fromZonedTime(`${dateYmd}T${timeHm}:00`, TIMEZONE).toISOString();
}

/** Fecha de calendario Chile (YYYY-MM-DD) para un instante dado. */
export function toChileDateString(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
}

/** Hora de calendario Chile (HH:mm) para un instante dado. */
export function toChileTimeString(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'HH:mm');
}

/** Lunes de la semana de Chile que contiene `anchor`, como YYYY-MM-DD. */
export function weekMondayYmd(anchor = new Date()): string {
  const local = toZonedTime(anchor, TIMEZONE);
  const monday = startOfWeek(local, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

/** Lunes a sábado (YYYY-MM-DD) de la semana que empieza en mondayYmd. */
export function weekDaysMonSatYmd(mondayYmd: string): string[] {
  const monday = parseYmdAsLocalParts(mondayYmd);
  return Array.from({ length: 6 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'));
}

/**
 * Lunes a domingo (YYYY-MM-DD) de la semana que empieza en mondayYmd. El panel
 * de la educadora muestra los 7 días (la plantilla puede incluir el domingo),
 * a diferencia del contrato público que solo llega hasta el sábado.
 */
export function weekDaysMonSunYmd(mondayYmd: string): string[] {
  const monday = parseYmdAsLocalParts(mondayYmd);
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'));
}

/** Domingo (YYYY-MM-DD) de la semana que empieza en mondayYmd. */
export function weekSundayYmd(mondayYmd: string): string {
  const monday = parseYmdAsLocalParts(mondayYmd);
  return format(addDays(monday, 6), 'yyyy-MM-dd');
}

/** Fecha de calendario Chile (YYYY-MM-DD) de hoy. */
export function todayChileYmd(now = new Date()): string {
  return toChileDateString(now);
}

/**
 * Rango `[inicio, fin)` en UTC de un día de calendario chileno, para usar en
 * consultas `startsAt: { gte, lt }`. `fin` es la medianoche del día siguiente.
 */
export function chileDayRange(dateYmd: string): [Date, Date] {
  const start = fromZonedTime(`${dateYmd}T00:00:00`, TIMEZONE);
  const end = fromZonedTime(`${format(addDays(parseYmdAsLocalParts(dateYmd), 1), 'yyyy-MM-dd')}T00:00:00`, TIMEZONE);
  return [start, end];
}

/** Día de la semana (0 domingo … 6 sábado) de una fecha YYYY-MM-DD, sin desfase horario. */
export function weekdayOf(dateYmd: string): number {
  return getDay(parseYmdAsLocalParts(dateYmd));
}

export function isPastSlot(startsAtIso: string, now = new Date()): boolean {
  return !isBefore(now, parseISO(startsAtIso));
}

/**
 * Convierte una fecha de calendario chilena (YYYY-MM-DD) al `Date` que hay que
 * escribir en una columna `@db.Date` de Prisma. Postgres `date` no lleva zona
 * horaria: si se le pasa un `Date` construido en hora local, lo trunca a su
 * componente UTC y en Chile (UTC-3/-4) eso cae en el día anterior. Por eso
 * **siempre** se construye a medianoche UTC, nunca con `new Date(y, m, d)`.
 *
 * Es el único lugar autorizado para esta conversión — ver
 * `.specs/001-fundaciones-dominio/plan.md`, sección "columna `date`".
 */
export function chileDateToColumn(dateYmd: string): Date {
  const [y, m, d] = dateYmd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Inversa de `chileDateToColumn`: lee una columna `@db.Date` y devuelve la
 * fecha de calendario chilena (YYYY-MM-DD) que representa. Se lee el
 * componente UTC del `Date`, nunca el local del proceso, por la misma razón
 * que en `chileDateToColumn`.
 */
export function columnToChileDate(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
