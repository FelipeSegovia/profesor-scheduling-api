import { Injectable } from '@nestjs/common';
import { deriveNotifications } from '../../domain/notifications.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACTIVITY_SESSION_WINDOW, loadRecentActivity } from '../activity.query.js';
import type { PanelNotificationsResponse } from './panel-notifications.types.js';

/** Máximo de ítems que devuelve la campana. */
export const NOTIFICATIONS_LIMIT = 20;

/** Cada sesión aporta como máximo dos eventos (alta + último cambio). */
const ACTIVITY_WINDOW_ITEMS = ACTIVITY_SESSION_WINDOW * 2;

@Injectable()
export class PanelNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(educatorId: string): Promise<PanelNotificationsResponse> {
    const [educator, activity] = await Promise.all([
      this.prisma.educator.findUniqueOrThrow({ where: { id: educatorId } }),
      loadRecentActivity(this.prisma, ACTIVITY_WINDOW_ITEMS),
    ]);

    const { items, unreadCount } = deriveNotifications(activity, educator.notificationsSeenAt);
    // El conteo sale de toda la ventana; solo la lista se recorta.
    return { items: items.slice(0, NOTIFICATIONS_LIMIT), unreadCount };
  }

  /** Marca todo como visto hasta este instante. */
  async markSeen(educatorId: string): Promise<void> {
    await this.prisma.educator.update({
      where: { id: educatorId },
      data: { notificationsSeenAt: new Date() },
    });
  }
}
