import type { Actor, SessionStatus } from '../generated/prisma/enums.js';

export interface SessionForActivity {
  id: string;
  childName: string;
  /** Inicio de la cita (no el momento del cambio). */
  startsAt: Date;
  createdAt: Date;
  createdBy: Actor;
  status: SessionStatus;
  statusChangedAt: Date | null;
  statusChangedBy: Actor | null;
}

export type ActivityKind = 'CREATED' | 'CONFIRMED' | 'CANCELLED' | 'NOT_CONFIRMED';

export interface ActivityItem {
  id: string;
  sessionId: string;
  kind: ActivityKind;
  childName: string;
  /** ISO. Inicio de la cita afectada, para ubicarla en la agenda. */
  startsAt: string;
  actor: Actor;
  at: string;
}

const KIND_BY_STATUS: Partial<Record<SessionStatus, ActivityKind>> = {
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  NOT_CONFIRMED: 'NOT_CONFIRMED',
};

/**
 * Deriva "actividad reciente" de `Session`, sin tabla de auditoría (decisión
 * del usuario, ver `.specs/004-panel-educadora/plan.md`). Limitación asumida:
 * solo se ve el último cambio de cada sesión, no el historial intermedio. Cada
 * sesión aporta como máximo dos eventos: su alta y, si ya cambió de estado, esa
 * transición.
 */
export function deriveActivity(sessions: SessionForActivity[], limit: number): ActivityItem[] {
  const events: ActivityItem[] = [];

  for (const session of sessions) {
    events.push({
      id: `${session.id}:created`,
      sessionId: session.id,
      kind: 'CREATED',
      childName: session.childName,
      startsAt: session.startsAt.toISOString(),
      actor: session.createdBy,
      at: session.createdAt.toISOString(),
    });

    const kind = KIND_BY_STATUS[session.status];
    if (kind && session.statusChangedAt && session.statusChangedBy) {
      events.push({
        id: `${session.id}:${session.status}`,
        sessionId: session.id,
        kind,
        childName: session.childName,
        startsAt: session.startsAt.toISOString(),
        actor: session.statusChangedBy,
        at: session.statusChangedAt.toISOString(),
      });
    }
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
