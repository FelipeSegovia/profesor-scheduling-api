import { sessionEvent } from './session-events.js';

describe('sessionEvent', () => {
  const base = {
    kind: 'CREATED',
    sessionId: 's1',
    childName: 'Mateo González',
    actor: 'GUARDIAN',
    at: new Date('2026-10-01T10:00:00Z'),
  } as const;

  it('arma el id como `${sessionId}:${kind}`, igual que ActivityItem', () => {
    const event = sessionEvent({ ...base, startsAt: new Date('2026-10-05T22:00:00Z') });
    expect(event.id).toBe('s1:CREATED');
  });

  it('normaliza las fechas a ISO, venga Date o string', () => {
    const fromDate = sessionEvent({ ...base, startsAt: new Date('2026-10-05T22:00:00Z') });
    const fromString = sessionEvent({ ...base, startsAt: '2026-10-05T22:00:00.000Z' });
    expect(fromDate.startsAt).toBe('2026-10-05T22:00:00.000Z');
    expect(fromString.startsAt).toBe('2026-10-05T22:00:00.000Z');
    expect(fromDate.at).toBe('2026-10-01T10:00:00.000Z');
  });

  it('conserva kind, actor, niño y sesión', () => {
    const event = sessionEvent({ ...base, kind: 'MOVED', actor: 'EDUCATOR', startsAt: base.at });
    expect(event).toMatchObject({
      kind: 'MOVED',
      actor: 'EDUCATOR',
      sessionId: 's1',
      childName: 'Mateo González',
    });
  });
});
