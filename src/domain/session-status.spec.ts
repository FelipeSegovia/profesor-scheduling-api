import { SessionStatus } from '../generated/prisma/enums.js';
import { fromWireStatus, STATUS_TO_WIRE, toWireStatus, WIRE_TO_STATUS } from './session-status.js';

describe('mapa de SessionStatus al contrato público', () => {
  it.each([
    [SessionStatus.PENDING, 'pendiente'],
    [SessionStatus.CONFIRMED, 'confirmada'],
    [SessionStatus.NOT_CONFIRMED, 'no_confirmada'],
    [SessionStatus.CANCELLED, 'cancelada'],
  ] as const)('%s <-> %s en ambas direcciones', (status, wire) => {
    expect(toWireStatus(status)).toBe(wire);
    expect(fromWireStatus(wire)).toBe(status);
  });

  it('cubre los cuatro valores del enum, ni más ni menos', () => {
    const allStatuses = Object.values(SessionStatus);
    expect(Object.keys(STATUS_TO_WIRE).sort()).toEqual(allStatuses.sort());
    expect(allStatuses).toHaveLength(4);
  });

  it('el inverso es exactamente eso: no hay dos estados con el mismo literal', () => {
    const wireValues = Object.values(STATUS_TO_WIRE);
    expect(new Set(wireValues).size).toBe(wireValues.length);
    expect(Object.keys(WIRE_TO_STATUS)).toHaveLength(wireValues.length);
  });
});
