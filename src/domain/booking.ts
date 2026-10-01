import { addHours, isBefore, parseISO } from 'date-fns';
import type { SessionStatus } from '../generated/prisma/enums.js';

/**
 * Portado de `public-parents-scheduling-web/src/domain/booking.ts`, con dos
 * cambios respecto del original (ver `.specs/001-fundaciones-dominio/spec.md`):
 * las horas de plazo se inyectan en vez de tener un default de 24, y
 * `initialSessionStatus` devuelve `SessionStatus` (el enum de Prisma) en vez
 * de un literal en español.
 */

const ACTIVE_STATUSES = new Set<SessionStatus>(['PENDING', 'CONFIRMED']);

export const HELP_REQUEST_MAX_LENGTH = 500;

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeHelpRequest(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isValidChildAge(age: number): boolean {
  return Number.isInteger(age) && age >= 3 && age <= 13;
}

export const REQUIRED_BOOKING_FIELDS_MESSAGE = 'Completa todos los campos obligatorios.';

/** Obligatorios en reserva; `helpRequest` queda fuera a propósito. */
export function hasAllRequiredBookingFields(fields: {
  guardianName: string;
  email: string;
  phone: string;
  childName: string;
  childAge: string | number;
}): boolean {
  if (
    !fields.guardianName.trim() ||
    !fields.email.trim() ||
    !fields.phone.trim() ||
    !fields.childName.trim()
  ) {
    return false;
  }
  if (typeof fields.childAge === 'string') {
    return fields.childAge.trim() !== '';
  }
  return Number.isFinite(fields.childAge);
}

type SessionLike = { startsAt: string; status: SessionStatus };

export function isSlotOccupied(startsAt: string, sessions: SessionLike[]): boolean {
  return sessions.some((s) => s.startsAt === startsAt && ACTIVE_STATUSES.has(s.status));
}

/**
 * True cuando el plazo de confirmación ya venció al momento de reservar
 * (incluye una cita del mismo día). `hoursBefore` viene de
 * `Preferences.confirmationDeadlineHours`; no hay default acá porque ese valor
 * siempre debe venir de la configuración vigente, nunca de un supuesto.
 */
export function confirmationDeadlinePassed(
  startsAtIso: string,
  hoursBefore: number,
  now = new Date(),
): boolean {
  const deadline = addHours(parseISO(startsAtIso), -hoursBefore);
  return !isBefore(now, deadline);
}

export function initialSessionStatus(
  startsAtIso: string,
  hoursBefore: number,
  now = new Date(),
): Extract<SessionStatus, 'PENDING' | 'CONFIRMED'> {
  return confirmationDeadlinePassed(startsAtIso, hoursBefore, now)
    ? 'CONFIRMED'
    : 'PENDING';
}

export function canCancelSession(session: SessionLike, now = new Date()): boolean {
  if (session.status !== 'PENDING' && session.status !== 'CONFIRMED') {
    return false;
  }
  return isBefore(now, parseISO(session.startsAt));
}

/**
 * Mover una sesión (panel de la educadora) exige lo mismo que cancelarla:
 * activa y no pasada. Si ya pasó o no está activa, primero hay que cancelarla
 * o crear una nueva.
 */
export function canMoveSession(session: SessionLike, now = new Date()): boolean {
  return canCancelSession(session, now);
}

/** Marcar `confirmada` a mano solo tiene sentido mientras sigue `pendiente`. */
export function canMarkConfirmed(session: SessionLike): boolean {
  return session.status === 'PENDING';
}
