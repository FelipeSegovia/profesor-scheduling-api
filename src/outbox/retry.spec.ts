import { MAX_ATTEMPTS, nextAttempt } from './retry.js';

const now = new Date('2026-10-02T12:00:00Z');
const minutesAfterNow = (d: Date) => (d.getTime() - now.getTime()) / 60_000;

describe('nextAttempt', () => {
  it.each([
    [1, 1],
    [2, 5],
    [3, 15],
    [4, 60],
  ])(
    'tras %i intento(s) fallido(s) reintenta en %i min',
    (attempts, minutes) => {
      const decision = nextAttempt(attempts, now);
      expect(decision.status).toBe('PENDING');
      if (decision.status === 'PENDING') {
        expect(minutesAfterNow(decision.nextAttemptAt)).toBe(minutes);
      }
    },
  );

  it('el 5.º fallo deja la fila en FAILED', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    expect(nextAttempt(5, now)).toEqual({ status: 'FAILED' });
    expect(nextAttempt(9, now)).toEqual({ status: 'FAILED' });
  });
});
