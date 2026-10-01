import { expandSeriesDates } from './series.js';

describe('expandSeriesDates', () => {
  it('genera una fecha por cada ocurrencia del weekday en el rango, inclusive en ambos extremos', () => {
    // 2026-10-05 es lunes; pedimos martes (weekday 2) hasta el 2026-10-27.
    const dates = expandSeriesDates({
      weekday: 2,
      time: '19:00',
      startDate: '2026-10-05',
      endDate: '2026-10-27',
    });
    expect(dates.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
  });

  it('incluye endDate si cae justo en el weekday pedido', () => {
    const dates = expandSeriesDates({
      weekday: 2,
      time: '19:00',
      startDate: '2026-10-06',
      endDate: '2026-10-06',
    });
    expect(dates).toHaveLength(1);
    expect(dates[0]!.date).toBe('2026-10-06');
  });

  it('vacío si el weekday no cae nunca dentro de un rango de 1 día', () => {
    const dates = expandSeriesDates({
      weekday: 3,
      time: '19:00',
      startDate: '2026-10-06',
      endDate: '2026-10-06',
    });
    expect(dates).toEqual([]);
  });

  it('startsAt mantiene la hora local a ambos lados del cambio de horario de Chile', () => {
    // Weekday 4 = jueves. Un rango que cruza el cambio de horario (abril en Chile).
    const dates = expandSeriesDates({
      weekday: 4,
      time: '19:00',
      startDate: '2026-04-02',
      endDate: '2026-04-16',
    });
    expect(dates.length).toBeGreaterThanOrEqual(2);
    const localHour = (iso: string) =>
      new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));
    for (const d of dates) {
      expect(localHour(d.startsAt)).toBe('19:00');
    }
  });
});
