import {
  chileDateToColumn,
  columnToChileDate,
  slotStartsAtIso,
  toChileDateString,
  weekdayOf,
  weekDaysMonSatYmd,
  weekMondayYmd,
  isPastSlot,
} from './time.js';

describe('slotStartsAtIso / toChileDateString', () => {
  it('vuelve al mismo día y hora local al convertir ida y vuelta', () => {
    const iso = slotStartsAtIso('2026-10-05', '19:00');
    expect(toChileDateString(new Date(iso))).toBe('2026-10-05');
  });

  /**
   * Autoverificable: no depende de conocer la fecha exacta del cambio de
   * horario chileno. Un cupo de las 19:00 en un día de verano y uno de
   * invierno debe seguir siendo 19:00 en hora de Chile en ambos casos, pero
   * sus instantes UTC deben ser distintos — eso demuestra que el dominio
   * absorbe el desfase en vez de asumir un offset fijo.
   */
  it('mantiene la hora local de un cupo a ambos lados del cambio de horario de Chile', () => {
    const summer = slotStartsAtIso('2026-01-15', '19:00'); // GMT-3 en Chile
    const winter = slotStartsAtIso('2026-07-15', '19:00'); // GMT-4 en Chile

    const localTime = (iso: string) =>
      new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));

    expect(localTime(summer)).toBe('19:00');
    expect(localTime(winter)).toBe('19:00');
    // Mismo componente local, distinto instante UTC: el offset cambió.
    expect(new Date(summer).getUTCHours()).not.toBe(new Date(winter).getUTCHours());
  });
});

describe('weekMondayYmd / weekDaysMonSatYmd / weekdayOf', () => {
  it('encuentra el lunes de una semana y arma lunes a sábado', () => {
    // 2026-10-08 es jueves.
    const monday = weekMondayYmd(new Date('2026-10-08T12:00:00Z'));
    expect(monday).toBe('2026-10-05');
    expect(weekDaysMonSatYmd(monday)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
  });

  it('calcula el día de la semana sin desfase horario', () => {
    expect(weekdayOf('2026-10-05')).toBe(1); // lunes
    expect(weekdayOf('2026-10-10')).toBe(6); // sábado
  });
});

describe('isPastSlot', () => {
  it('es true solo cuando el instante ya pasó', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    expect(isPastSlot('2026-10-05T11:00:00Z', now)).toBe(true);
    expect(isPastSlot('2026-10-05T13:00:00Z', now)).toBe(false);
  });
});

describe('chileDateToColumn / columnToChileDate', () => {
  const dates = ['2026-01-15', '2026-07-15', '2026-10-05', '2026-12-31', '2026-01-01'];

  it.each(dates)('%s hace un viaje de ida y vuelta exacto', (ymd) => {
    expect(columnToChileDate(chileDateToColumn(ymd))).toBe(ymd);
  });

  it('no corre el día sin importar la zona horaria del proceso', () => {
    // chileDateToColumn siempre construye a medianoche UTC: el resultado no
    // debe depender de TZ del proceso que lo ejecuta.
    const column = chileDateToColumn('2026-10-05');
    expect(column.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(columnToChileDate(column)).toBe('2026-10-05');
  });
});
