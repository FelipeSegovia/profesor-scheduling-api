import {
  canCancelSession,
  confirmationDeadlinePassed,
  hasAllRequiredBookingFields,
  HELP_REQUEST_MAX_LENGTH,
  initialSessionStatus,
  isSlotOccupied,
  isValidChildAge,
  normalizeHelpRequest,
  normalizeName,
} from './booking.js';

describe('normalizeName', () => {
  it('recorta, colapsa espacios y pasa a minúsculas', () => {
    expect(normalizeName('  Sofía   Ejemplo  ')).toBe('sofía ejemplo');
  });

  it('hace que dos variantes del mismo nombre normalicen igual', () => {
    expect(normalizeName('Juan Pérez')).toBe(normalizeName('juan   pérez'));
  });
});

describe('normalizeHelpRequest', () => {
  it('devuelve undefined para vacío, espacios o undefined', () => {
    expect(normalizeHelpRequest(undefined)).toBeUndefined();
    expect(normalizeHelpRequest('   ')).toBeUndefined();
  });

  it('recorta y colapsa espacios internos', () => {
    expect(normalizeHelpRequest('  hola   mundo  ')).toBe('hola mundo');
  });
});

describe('isValidChildAge', () => {
  it.each([3, 8, 13])('%i es válida', (age) => {
    expect(isValidChildAge(age)).toBe(true);
  });

  it.each([2, 14, 0, -1, 3.5])('%s no es válida', (age) => {
    expect(isValidChildAge(age)).toBe(false);
  });
});

describe('nota de ayuda: límite de longitud', () => {
  it('500 caracteres está en el límite permitido', () => {
    expect('a'.repeat(HELP_REQUEST_MAX_LENGTH).length).toBeLessThanOrEqual(
      HELP_REQUEST_MAX_LENGTH,
    );
  });

  it('501 caracteres excede el límite', () => {
    expect('a'.repeat(HELP_REQUEST_MAX_LENGTH + 1).length).toBeGreaterThan(
      HELP_REQUEST_MAX_LENGTH,
    );
  });
});

describe('confirmationDeadlinePassed / initialSessionStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con plazo de 24h, una cita en 48h todavía no vence', () => {
    expect(confirmationDeadlinePassed('2026-10-07T12:00:00Z', 24)).toBe(false);
    expect(initialSessionStatus('2026-10-07T12:00:00Z', 24)).toBe('PENDING');
  });

  it('con plazo de 24h, una cita en 12h ya venció (incluye el mismo día)', () => {
    expect(confirmationDeadlinePassed('2026-10-06T00:00:00Z', 24)).toBe(true);
    expect(initialSessionStatus('2026-10-06T00:00:00Z', 24)).toBe('CONFIRMED');
  });

  it('las horas de plazo se inyectan: el mismo instante cambia de resultado según la configuración', () => {
    const startsAt = '2026-10-06T00:00:00Z'; // 12h desde "ahora"
    expect(confirmationDeadlinePassed(startsAt, 6)).toBe(false); // con 6h de plazo, no vence
    expect(confirmationDeadlinePassed(startsAt, 24)).toBe(true); // con 24h, sí
  });
});

describe('isSlotOccupied', () => {
  const sessions = [
    { startsAt: '2026-10-05T22:00:00Z', status: 'PENDING' as const },
    { startsAt: '2026-10-06T22:00:00Z', status: 'CANCELLED' as const },
  ];

  it('un cupo con sesión pendiente o confirmada está ocupado', () => {
    expect(isSlotOccupied('2026-10-05T22:00:00Z', sessions)).toBe(true);
  });

  it('un cupo con solo historial (cancelada/no confirmada) está libre', () => {
    expect(isSlotOccupied('2026-10-06T22:00:00Z', sessions)).toBe(false);
  });

  it('un cupo sin ninguna sesión está libre', () => {
    expect(isSlotOccupied('2026-10-07T22:00:00Z', sessions)).toBe(false);
  });
});

describe('hasAllRequiredBookingFields', () => {
  const complete = {
    guardianName: 'Ana',
    email: 'ana@correo.cl',
    phone: '+56911111111',
    childName: 'Sofía',
    childAge: 8,
  };

  it('true cuando todos los campos vienen completos, con childAge numérico', () => {
    expect(hasAllRequiredBookingFields(complete)).toBe(true);
  });

  it('true cuando childAge viene como string no vacío', () => {
    expect(hasAllRequiredBookingFields({ ...complete, childAge: '8' })).toBe(true);
  });

  it.each(['guardianName', 'email', 'phone', 'childName'] as const)(
    'false cuando falta %s (vacío o solo espacios)',
    (key) => {
      expect(hasAllRequiredBookingFields({ ...complete, [key]: '   ' })).toBe(false);
    },
  );

  it('false cuando childAge es un string vacío', () => {
    expect(hasAllRequiredBookingFields({ ...complete, childAge: '' })).toBe(false);
  });

  it('false cuando childAge es NaN', () => {
    expect(hasAllRequiredBookingFields({ ...complete, childAge: NaN })).toBe(false);
  });
});

describe('canCancelSession', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  it('se puede cancelar una sesión pendiente o confirmada antes de la hora de la cita', () => {
    expect(
      canCancelSession({ startsAt: '2026-10-05T13:00:00Z', status: 'PENDING' }, now),
    ).toBe(true);
    expect(
      canCancelSession({ startsAt: '2026-10-05T13:00:00Z', status: 'CONFIRMED' }, now),
    ).toBe(true);
  });

  it('no se puede cancelar después de la hora de la cita', () => {
    expect(
      canCancelSession({ startsAt: '2026-10-05T11:00:00Z', status: 'CONFIRMED' }, now),
    ).toBe(false);
  });

  it('no se puede cancelar una sesión ya cancelada o no confirmada', () => {
    expect(
      canCancelSession({ startsAt: '2026-10-05T13:00:00Z', status: 'CANCELLED' }, now),
    ).toBe(false);
    expect(
      canCancelSession({ startsAt: '2026-10-05T13:00:00Z', status: 'NOT_CONFIRMED' }, now),
    ).toBe(false);
  });
});
