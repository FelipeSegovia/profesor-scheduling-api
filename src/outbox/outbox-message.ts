import { cancelUrl, confirmUrl } from '../email/email-links.js';
import type { EmailMessage } from '../email/email-message.js';
import { columnToChileDate } from '../domain/time.js';

/** Lo que el despachador necesita de la sesión de una fila (spec 006). */
export interface SessionForEmail {
  startsAt: Date;
  status: 'PENDING' | 'CONFIRMED' | 'NOT_CONFIRMED' | 'CANCELLED';
  confirmToken: string;
  cancelToken: string;
  child: { name: string };
  guardian: { name: string };
}

export interface MessageContext {
  /** `PUBLIC_WEB_URL`. */
  baseUrl: string;
  confirmationDeadlineHours: number;
  now: Date;
}

export type MessageDecision =
  | { action: 'send'; message: EmailMessage }
  | { action: 'skip'; reason: string }
  | { action: 'fail'; error: string };

/** Correos al apoderado: los que se omiten si la cita ya pasó. */
const GUARDIAN_KINDS = new Set([
  'BOOKING_PENDING',
  'BOOKING_CONFIRMED',
  'CONFIRMED',
  'CANCELLED',
  'RESCHEDULED',
]);

/**
 * Correos al apoderado que invitan a asistir. Si la sesión ya está cancelada o
 * vencida al momento de enviar, se omiten: el apoderado ya recibe (o recibirá)
 * el correo de cancelación, y los enlaces de este no servirían.
 */
const ATTENDANCE_KINDS = new Set([
  'BOOKING_PENDING',
  'BOOKING_CONFIRMED',
  'CONFIRMED',
  'RESCHEDULED',
]);

/**
 * Decide qué correo armar para una fila de `OutboxEmail` con el estado de la
 * sesión **al momento de enviar** (la fila no guarda payload). Puro: el
 * despachador carga los datos y aplica la decisión.
 */
export function buildMessage(
  kind: string,
  session: SessionForEmail | null,
  ctx: MessageContext,
): MessageDecision {
  if (!session) return { action: 'fail', error: 'session not found' };

  if (GUARDIAN_KINDS.has(kind) && session.startsAt <= ctx.now) {
    return { action: 'skip', reason: 'session already started' };
  }
  if (
    ATTENDANCE_KINDS.has(kind) &&
    (session.status === 'CANCELLED' || session.status === 'NOT_CONFIRMED')
  ) {
    return { action: 'skip', reason: `session is ${session.status}` };
  }

  const childName = session.child.name;
  const startsAt = session.startsAt;
  const cancel = cancelUrl(ctx.baseUrl, session.cancelToken);

  switch (kind) {
    case 'BOOKING_PENDING':
      return send({
        kind,
        childName,
        startsAt,
        confirmBy: new Date(
          startsAt.getTime() - ctx.confirmationDeadlineHours * 3_600_000,
        ),
        confirmUrl: confirmUrl(ctx.baseUrl, session.confirmToken),
        cancelUrl: cancel,
      });
    case 'BOOKING_CONFIRMED':
    case 'CONFIRMED':
      return send({ kind, childName, startsAt, cancelUrl: cancel });
    case 'CANCELLED':
      return send({ kind, childName, startsAt });
    case 'RESCHEDULED':
      return send({
        kind,
        childName,
        startsAt,
        confirmUrl:
          session.status === 'PENDING'
            ? confirmUrl(ctx.baseUrl, session.confirmToken)
            : null,
        cancelUrl: cancel,
      });
    case 'GUARDIAN_CONFIRMED':
    case 'GUARDIAN_CANCELLED':
    case 'SYSTEM_CONFIRMED':
      return send({
        kind,
        childName,
        guardianName: session.guardian.name,
        startsAt,
      });
    default:
      return { action: 'fail', error: `unknown kind: ${kind}` };
  }
}

function send(message: EmailMessage): MessageDecision {
  return { action: 'send', message };
}

/** Lo que el despachador necesita de un registro de la ficha clínica (spec 007). */
export interface ClinicalNoteForEmail {
  /** Columna `@db.Date`. */
  date: Date;
  title: string;
  body: string;
  child: { name: string; guardian: { name: string } };
}

/**
 * Decide el correo de una fila `CLINICAL_NOTE` con el contenido del registro
 * **al momento de enviar**, igual que `buildMessage` con la sesión: una
 * corrección hecha antes del despacho llega corregida. Si el registro ya no
 * existe (la educadora lo borró), se omite en vez de fallar: no hay nada que
 * reintentar. No aplica la regla de "cita ya empezada": no invita a asistir.
 */
export function buildClinicalNoteMessage(
  note: ClinicalNoteForEmail | null,
): MessageDecision {
  if (!note) return { action: 'skip', reason: 'clinical note deleted' };
  return send({
    kind: 'CLINICAL_NOTE',
    childName: note.child.name,
    guardianName: note.child.guardian.name,
    date: columnToChileDate(note.date),
    title: note.title,
    body: note.body,
  });
}
