import { describe, expect, it } from 'vitest';
import { resolveSlotState } from './slot-grid.js';

describe('resolveSlotState', () => {
  it('prioriza BOOKED sobre cualquier bloqueo', () => {
    expect(
      resolveSlotState({ occupied: true, dayBlocked: true, slotBlocked: true, beyondHorizon: true }),
    ).toBe('BOOKED');
  });

  it('BLOCKED_DAY si no hay sesión pero el día está bloqueado', () => {
    expect(
      resolveSlotState({ occupied: false, dayBlocked: true, slotBlocked: true, beyondHorizon: true }),
    ).toBe('BLOCKED_DAY');
  });

  it('BLOCKED_SLOT si el día no está bloqueado pero el cupo sí', () => {
    expect(
      resolveSlotState({ occupied: false, dayBlocked: false, slotBlocked: true, beyondHorizon: true }),
    ).toBe('BLOCKED_SLOT');
  });

  it('BEYOND_HORIZON si no hay ocupación ni bloqueos pero excede el horizonte', () => {
    expect(
      resolveSlotState({ occupied: false, dayBlocked: false, slotBlocked: false, beyondHorizon: true }),
    ).toBe('BEYOND_HORIZON');
  });

  it('FREE si nada aplica', () => {
    expect(
      resolveSlotState({ occupied: false, dayBlocked: false, slotBlocked: false, beyondHorizon: false }),
    ).toBe('FREE');
  });
});
