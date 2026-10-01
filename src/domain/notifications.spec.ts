import type { ActivityItem } from './activity.js';
import { deriveNotifications } from './notifications.js';

function item(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: 's1:created',
    sessionId: 's1',
    kind: 'CREATED',
    childName: 'Mateo González',
    startsAt: '2026-10-05T22:00:00.000Z',
    actor: 'GUARDIAN',
    at: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('deriveNotifications', () => {
  it('descarta lo que hizo la propia educadora', () => {
    const { items, unreadCount } = deriveNotifications(
      [item({ id: 'a', actor: 'EDUCATOR' }), item({ id: 'b', actor: 'GUARDIAN' })],
      null,
    );
    expect(items.map((i) => i.id)).toEqual(['b']);
    expect(unreadCount).toBe(1);
  });

  it('conserva lo del sistema (vencimiento) y lo del apoderado', () => {
    const { items } = deriveNotifications(
      [item({ id: 'a', actor: 'SYSTEM', kind: 'NOT_CONFIRMED' }), item({ id: 'b' })],
      null,
    );
    expect(items).toHaveLength(2);
  });

  it('con seenAt nulo todo es no leído', () => {
    const { items, unreadCount } = deriveNotifications(
      [item({ id: 'a' }), item({ id: 'b', at: '2026-09-01T10:00:00.000Z' })],
      null,
    );
    expect(items.every((i) => i.unread)).toBe(true);
    expect(unreadCount).toBe(2);
  });

  it('solo es no leído lo posterior a seenAt', () => {
    const seenAt = new Date('2026-10-01T12:00:00.000Z');
    const { items, unreadCount } = deriveNotifications(
      [
        item({ id: 'nuevo', at: '2026-10-01T12:00:01.000Z' }),
        item({ id: 'viejo', at: '2026-10-01T11:59:59.000Z' }),
      ],
      seenAt,
    );
    expect(items.map((i) => [i.id, i.unread])).toEqual([
      ['nuevo', true],
      ['viejo', false],
    ]);
    expect(unreadCount).toBe(1);
  });

  it('un ítem exactamente en seenAt cuenta como leído', () => {
    const { unreadCount } = deriveNotifications(
      [item({ at: '2026-10-01T12:00:00.000Z' })],
      new Date('2026-10-01T12:00:00.000Z'),
    );
    expect(unreadCount).toBe(0);
  });

  it('sin actividad devuelve vacío', () => {
    expect(deriveNotifications([], null)).toEqual({ items: [], unreadCount: 0 });
  });
});
