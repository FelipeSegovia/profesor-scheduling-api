import type { NotificationItem } from '../../domain/notifications.js';

export type { NotificationItem };

/** Respuesta de `GET /api/panel/notifications`. */
export interface PanelNotificationsResponse {
  /** Más recientes primero, máximo `NOTIFICATIONS_LIMIT`. */
  items: NotificationItem[];
  /** No leídas dentro de toda la ventana, no solo de los `items` devueltos. */
  unreadCount: number;
}
