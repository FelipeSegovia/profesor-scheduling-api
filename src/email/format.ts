import { es } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE } from '../domain/time.js';

/** Fecha de la cita en Chile, en español: "lunes 5 de octubre". */
export function formatSessionDate(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "EEEE d 'de' MMMM", { locale: es });
}

/** Fecha y hora de la cita en Chile, en español: "lunes 5 de octubre, 19:00". */
export function formatSessionDateTime(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "EEEE d 'de' MMMM, HH:mm", {
    locale: es,
  });
}

/**
 * Fecha de calendario (`YYYY-MM-DD`, sin hora) en español: "lunes 5 de
 * octubre". Para fechas que no son un instante, como la de un registro de la
 * ficha clínica: `formatSessionDate` la correría al día anterior al convertir
 * de UTC a Chile. Se formatea a mediodía UTC para no depender de la zona del
 * proceso ni de la hora.
 */
export function formatCalendarDate(ymd: string): string {
  return formatInTimeZone(
    new Date(`${ymd}T12:00:00Z`),
    'UTC',
    "EEEE d 'de' MMMM",
    {
      locale: es,
    },
  );
}

/** Como `formatCalendarDate`, con el año: "lunes 5 de octubre de 2026". Para el PDF del historial. */
export function formatCalendarDateWithYear(ymd: string): string {
  return formatInTimeZone(
    new Date(`${ymd}T12:00:00Z`),
    'UTC',
    "EEEE d 'de' MMMM 'de' yyyy",
    { locale: es },
  );
}
