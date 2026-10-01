import { Prisma } from '../../generated/prisma/client.js';
import { isSlotTakenViolation } from './prisma-errors.js';

function p2002(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta: { target },
  });
}

/** Forma real del error con el driver adapter (@prisma/adapter-pg@7.10.0). */
function p2002DriverAdapter(indexName: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
    meta: { driverAdapterError: { cause: { constraint: { index: indexName } } } },
  });
}

describe('isSlotTakenViolation', () => {
  it('true cuando el P2002 apunta al índice session_active_slot (string)', () => {
    expect(isSlotTakenViolation(p2002('session_active_slot'))).toBe(true);
  });

  it('true cuando el P2002 apunta al índice session_active_slot (array)', () => {
    expect(isSlotTakenViolation(p2002(['session_active_slot']))).toBe(true);
  });

  it('false cuando el P2002 apunta a otro constraint (ej. confirmToken)', () => {
    expect(isSlotTakenViolation(p2002('Session_confirmToken_key'))).toBe(false);
  });

  it('true con la forma real del driver adapter (meta.driverAdapterError.cause.constraint.index)', () => {
    expect(isSlotTakenViolation(p2002DriverAdapter('session_active_slot'))).toBe(true);
  });

  it('false con la forma del driver adapter apuntando a otro índice', () => {
    expect(isSlotTakenViolation(p2002DriverAdapter('Session_confirmToken_key'))).toBe(false);
  });

  it('false para un error que no es P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '7.10.0',
    });
    expect(isSlotTakenViolation(err)).toBe(false);
  });

  it('false para cualquier error que no sea de Prisma', () => {
    expect(isSlotTakenViolation(new Error('boom'))).toBe(false);
    expect(isSlotTakenViolation(null)).toBe(false);
    expect(isSlotTakenViolation(undefined)).toBe(false);
  });
});
