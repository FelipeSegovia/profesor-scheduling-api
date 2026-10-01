import type { Actor } from '../generated/prisma/enums.js';
import type { SessionEvent, SessionEventKind } from './session-events.types.js';

export interface SessionEventParams {
  kind: SessionEventKind;
  sessionId: string;
  childName: string;
  startsAt: Date | string;
  actor: Actor;
  at: Date;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/** Arma un `SessionEvent` con su `id` y las fechas normalizadas a ISO. */
export function sessionEvent(params: SessionEventParams): SessionEvent {
  return {
    id: `${params.sessionId}:${params.kind}`,
    kind: params.kind,
    sessionId: params.sessionId,
    childName: params.childName,
    startsAt: toIso(params.startsAt),
    actor: params.actor,
    at: params.at.toISOString(),
  };
}
