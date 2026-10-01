import type { ActivityItem } from './activity.js';

export type NotificationItem = ActivityItem & { unread: boolean };

export interface NotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
}

/**
 * Campana del panel: la actividad reciente menos lo que hizo la propia
 * educadora (ella no necesita aviso de lo que hace en su agenda). Un ítem es
 * "no leído" si ocurrió después de `seenAt`; con `seenAt` nulo (nunca abrió la
 * campana) todos lo son. Un ítem exactamente en `seenAt` cuenta como leído.
 */
export function deriveNotifications(
  activity: ActivityItem[],
  seenAt: Date | null,
): NotificationsResult {
  const items = activity
    .filter((item) => item.actor !== 'EDUCATOR')
    .map((item) => ({
      ...item,
      unread: seenAt === null || new Date(item.at) > seenAt,
    }));

  return { items, unreadCount: items.filter((item) => item.unread).length };
}
