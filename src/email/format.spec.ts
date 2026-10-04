import {
  formatCalendarDate,
  formatCalendarDateWithYear,
  formatSessionDate,
  formatSessionDateTime,
} from './format.js';

describe('formato de fechas de los correos', () => {
  it('muestra la hora de Chile en horario de verano (UTC-3)', () => {
    // Lunes 5 de octubre de 2026, 19:00 en Chile = 22:00 UTC.
    const startsAt = new Date('2026-10-05T22:00:00Z');
    expect(formatSessionDateTime(startsAt)).toBe('lunes 5 de octubre, 19:00');
    expect(formatSessionDate(startsAt)).toBe('lunes 5 de octubre');
  });

  it('muestra la hora de Chile en horario de invierno (UTC-4)', () => {
    // Lunes 6 de julio de 2026, 19:00 en Chile = 23:00 UTC.
    expect(formatSessionDateTime(new Date('2026-07-06T23:00:00Z'))).toBe(
      'lunes 6 de julio, 19:00',
    );
  });

  it('usa el día de Chile aunque en UTC ya sea el día siguiente', () => {
    // Sábado 10 de octubre de 2026, 21:00 en Chile = domingo 00:00 UTC.
    expect(formatSessionDateTime(new Date('2026-10-11T00:00:00Z'))).toBe(
      'sábado 10 de octubre, 21:00',
    );
  });
});

describe('formatCalendarDate', () => {
  it('muestra el día de calendario sin correrlo por la zona horaria', () => {
    expect(formatCalendarDate('2026-10-05')).toBe('lunes 5 de octubre');
    expect(formatCalendarDate('2026-07-06')).toBe('lunes 6 de julio');
  });

  it('cubre el cambio de mes y de año', () => {
    expect(formatCalendarDate('2026-12-31')).toBe('jueves 31 de diciembre');
    expect(formatCalendarDate('2027-01-01')).toBe('viernes 1 de enero');
  });
});

describe('formatCalendarDateWithYear', () => {
  it('agrega el año', () => {
    expect(formatCalendarDateWithYear('2026-10-05')).toBe(
      'lunes 5 de octubre de 2026',
    );
    expect(formatCalendarDateWithYear('2027-01-01')).toBe(
      'viernes 1 de enero de 2027',
    );
  });
});
