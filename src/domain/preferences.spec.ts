import { validatePreferences } from './preferences.js';

const base = { confirmationDeadlineHours: 24, seriesNoticeHours: 48, bookingHorizonWeeks: 8 };

describe('validatePreferences', () => {
  it('válido con los valores iniciales del MVP', () => {
    expect(validatePreferences(base)).toBeNull();
  });

  it('inválido si seriesNoticeHours es igual a confirmationDeadlineHours', () => {
    expect(
      validatePreferences({ ...base, confirmationDeadlineHours: 24, seriesNoticeHours: 24 }),
    ).toBe('INVALID_PREFERENCES');
  });

  it('inválido si seriesNoticeHours es menor', () => {
    expect(
      validatePreferences({ ...base, confirmationDeadlineHours: 48, seriesNoticeHours: 24 }),
    ).toBe('INVALID_PREFERENCES');
  });

  it('inválido si bookingHorizonWeeks está fuera de 1..52', () => {
    expect(validatePreferences({ ...base, bookingHorizonWeeks: 0 })).toBe('INVALID_RANGE');
    expect(validatePreferences({ ...base, bookingHorizonWeeks: 53 })).toBe('INVALID_RANGE');
  });

  it('inválido si algún valor no es entero', () => {
    expect(validatePreferences({ ...base, confirmationDeadlineHours: 24.5 })).toBe('INVALID_RANGE');
  });
});
