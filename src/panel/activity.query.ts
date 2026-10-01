import { deriveActivity, type ActivityItem } from '../domain/activity.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Cuántas sesiones (las modificadas más recientemente) se leen para derivar la
 * actividad. Acota el costo y fija la ventana de "no leídas" de la campana.
 */
export const ACTIVITY_SESSION_WINDOW = 50;

/**
 * Actividad reciente del panel, derivada de `Session` (sin tabla de auditoría).
 * La comparten el resumen (`GET /panel/summary`) y la campana
 * (`GET /panel/notifications`); `limit` recorta cuántos ítems devuelve.
 */
export async function loadRecentActivity(
  prisma: Pick<PrismaService, 'session'>,
  limit: number,
): Promise<ActivityItem[]> {
  const sessions = await prisma.session.findMany({
    include: { child: true },
    orderBy: { updatedAt: 'desc' },
    take: ACTIVITY_SESSION_WINDOW,
  });

  return deriveActivity(
    sessions.map((s) => ({
      id: s.id,
      childName: s.child.name,
      startsAt: s.startsAt,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
      status: s.status,
      statusChangedAt: s.statusChangedAt,
      statusChangedBy: s.statusChangedBy,
    })),
    limit,
  );
}
