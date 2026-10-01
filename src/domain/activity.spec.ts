import { deriveActivity, type SessionForActivity } from './activity.js';

function session(overrides: Partial<SessionForActivity>): SessionForActivity {
  return {
    id: 's1',
    childName: 'Mateo González',
    startsAt: new Date('2026-10-05T22:00:00Z'),
    createdAt: new Date('2026-10-01T10:00:00Z'),
    createdBy: 'GUARDIAN',
    status: 'PENDING',
    statusChangedAt: null,
    statusChangedBy: null,
    ...overrides,
  };
}

describe('deriveActivity', () => {
  it('una sesión sin cambio de estado aporta solo el evento de alta', () => {
    const activity = deriveActivity([session({})], 10);
    expect(activity).toEqual([
      expect.objectContaining({ kind: 'CREATED', sessionId: 's1', actor: 'GUARDIAN' }),
    ]);
  });

  it('una sesión con cambio de estado aporta alta + transición', () => {
    const activity = deriveActivity(
      [
        session({
          status: 'CONFIRMED',
          statusChangedAt: new Date('2026-10-02T09:00:00Z'),
          statusChangedBy: 'GUARDIAN',
        }),
      ],
      10,
    );
    expect(activity).toHaveLength(2);
    expect(activity[0]).toEqual(expect.objectContaining({ kind: 'CONFIRMED', actor: 'GUARDIAN' }));
    expect(activity[1]).toEqual(expect.objectContaining({ kind: 'CREATED', actor: 'GUARDIAN' }));
  });

  it('ordena por recencia y respeta el límite', () => {
    const sessions = [
      session({ id: 'old', createdAt: new Date('2026-09-01T00:00:00Z') }),
      session({ id: 'new', createdAt: new Date('2026-10-05T00:00:00Z') }),
    ];
    const activity = deriveActivity(sessions, 1);
    expect(activity).toHaveLength(1);
    expect(activity[0]!.sessionId).toBe('new');
  });

  it('no genera evento de transición para PENDING (no está en el mapa de kinds)', () => {
    const activity = deriveActivity(
      [session({ status: 'PENDING', statusChangedAt: new Date(), statusChangedBy: 'EDUCATOR' })],
      10,
    );
    expect(activity).toHaveLength(1);
  });

  it('el alta y el cambio de estado llevan el startsAt de la cita, en ISO', () => {
    const activity = deriveActivity(
      [
        session({
          status: 'CANCELLED',
          statusChangedAt: new Date('2026-10-02T09:00:00Z'),
          statusChangedBy: 'GUARDIAN',
        }),
      ],
      10,
    );
    expect(activity).toHaveLength(2);
    expect(activity.map((a) => a.startsAt)).toEqual([
      '2026-10-05T22:00:00.000Z',
      '2026-10-05T22:00:00.000Z',
    ]);
  });
});
