import {
  collapseHoursToRange,
  expandRangeToHours,
  isContiguousHourRange,
  templateRowsFromWorkWeek,
  workWeekFromTemplateRows,
} from './schedule.js';

describe('expandRangeToHours', () => {
  it('genera una hora por cada hora entera entre start (incl.) y end (excl.)', () => {
    expect(expandRangeToHours('19:00', '21:00')).toEqual(['19:00', '20:00']);
    expect(expandRangeToHours('09:00', '13:00')).toEqual(['09:00', '10:00', '11:00', '12:00']);
  });

  it('vacío si falta un extremo', () => {
    expect(expandRangeToHours(null, '13:00')).toEqual([]);
    expect(expandRangeToHours('09:00', null)).toEqual([]);
  });

  it('vacío si end <= start', () => {
    expect(expandRangeToHours('13:00', '13:00')).toEqual([]);
    expect(expandRangeToHours('13:00', '09:00')).toEqual([]);
  });
});

describe('collapseHoursToRange / isContiguousHourRange', () => {
  it('cubre el rango completo de horas contiguas', () => {
    expect(collapseHoursToRange(['19:00', '20:00'])).toEqual({ start: '19:00', end: '21:00' });
    expect(isContiguousHourRange(['19:00', '20:00'])).toBe(true);
  });

  it('detecta huecos', () => {
    expect(isContiguousHourRange(['09:00', '11:00'])).toBe(false);
    // El rango resultante sigue siendo min..max+1h, aunque mienta sobre el hueco.
    expect(collapseHoursToRange(['09:00', '11:00'])).toEqual({ start: '09:00', end: '12:00' });
  });

  it('null para una lista vacía', () => {
    expect(collapseHoursToRange([])).toBeNull();
  });
});

describe('templateRowsFromWorkWeek / workWeekFromTemplateRows', () => {
  it('ida y vuelta exacta para un día contiguo', () => {
    const workWeek = [
      { weekday: 0, available: false, start: null, end: null },
      { weekday: 1, available: true, start: '19:00', end: '21:00' },
      { weekday: 2, available: false, start: null, end: null },
      { weekday: 3, available: false, start: null, end: null },
      { weekday: 4, available: false, start: null, end: null },
      { weekday: 5, available: false, start: null, end: null },
      { weekday: 6, available: true, start: '09:00', end: '12:00' },
    ];
    const rows = templateRowsFromWorkWeek(workWeek);
    expect(rows).toEqual(
      expect.arrayContaining([
        { weekday: 1, time: '19:00' },
        { weekday: 1, time: '20:00' },
        { weekday: 6, time: '09:00' },
        { weekday: 6, time: '10:00' },
        { weekday: 6, time: '11:00' },
      ]),
    );
    expect(rows).toHaveLength(5);

    const back = workWeekFromTemplateRows(rows);
    const monday = back.find((d) => d.weekday === 1)!;
    expect(monday).toMatchObject({ available: true, start: '19:00', end: '21:00', contiguous: true });
    const sunday = back.find((d) => d.weekday === 0)!;
    expect(sunday).toMatchObject({ available: false, start: null, end: null });
  });

  it('marca contiguous:false cuando las filas persistidas tienen un hueco', () => {
    const rows = [
      { weekday: 2, time: '09:00' },
      { weekday: 2, time: '11:00' },
    ];
    const tuesday = workWeekFromTemplateRows(rows).find((d) => d.weekday === 2)!;
    expect(tuesday.contiguous).toBe(false);
    expect(tuesday.times).toEqual(['09:00', '11:00']);
  });
});
