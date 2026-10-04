import {
  buildClinicalNoteMessage,
  buildMessage,
  type SessionForEmail,
} from './outbox-message.js';

const now = new Date('2026-10-02T12:00:00Z');
// Lunes 5 de octubre de 2026, 19:00 en Chile.
const startsAt = new Date('2026-10-05T22:00:00Z');
const ctx = {
  baseUrl: 'http://localhost:5173',
  confirmationDeadlineHours: 24,
  now,
};

function session(overrides: Partial<SessionForEmail> = {}): SessionForEmail {
  return {
    startsAt,
    status: 'PENDING',
    confirmToken: 'tok-confirm',
    cancelToken: 'tok-cancel',
    child: { name: 'Tomás' },
    guardian: { name: 'Ana Pérez' },
    ...overrides,
  };
}

const confirmUrl = 'http://localhost:5173/sesion/tok-confirm/confirmar';
const cancelUrl = 'http://localhost:5173/sesion/tok-cancel/cancelar';

describe('buildMessage', () => {
  it('BOOKING_PENDING: enlaces y plazo = startsAt − horas de confirmación', () => {
    expect(buildMessage('BOOKING_PENDING', session(), ctx)).toEqual({
      action: 'send',
      message: {
        kind: 'BOOKING_PENDING',
        childName: 'Tomás',
        startsAt,
        confirmBy: new Date('2026-10-04T22:00:00Z'),
        confirmUrl,
        cancelUrl,
      },
    });
  });

  it.each(['BOOKING_CONFIRMED', 'CONFIRMED'] as const)(
    '%s: solo enlace para cancelar',
    (kind) => {
      expect(buildMessage(kind, session({ status: 'CONFIRMED' }), ctx)).toEqual(
        {
          action: 'send',
          message: { kind, childName: 'Tomás', startsAt, cancelUrl },
        },
      );
    },
  );

  it('CANCELLED: sin enlaces, aunque la sesión esté cancelada', () => {
    expect(
      buildMessage('CANCELLED', session({ status: 'CANCELLED' }), ctx),
    ).toEqual({
      action: 'send',
      message: { kind: 'CANCELLED', childName: 'Tomás', startsAt },
    });
  });

  it('RESCHEDULED: pide confirmar solo si la sesión sigue PENDING', () => {
    expect(buildMessage('RESCHEDULED', session(), ctx)).toMatchObject({
      action: 'send',
      message: { kind: 'RESCHEDULED', confirmUrl, cancelUrl },
    });
    expect(
      buildMessage('RESCHEDULED', session({ status: 'CONFIRMED' }), ctx),
    ).toMatchObject({
      action: 'send',
      message: { kind: 'RESCHEDULED', confirmUrl: null, cancelUrl },
    });
  });

  it.each([
    'GUARDIAN_CONFIRMED',
    'GUARDIAN_CANCELLED',
    'SYSTEM_CONFIRMED',
  ] as const)(
    '%s: a la educadora, con el nombre del apoderado y sin enlaces',
    (kind) => {
      expect(buildMessage(kind, session(), ctx)).toEqual({
        action: 'send',
        message: {
          kind,
          childName: 'Tomás',
          guardianName: 'Ana Pérez',
          startsAt,
        },
      });
    },
  );

  it('omite los correos al apoderado de una cita que ya empezó', () => {
    const past = session({ startsAt: new Date('2026-10-02T11:00:00Z') });
    for (const kind of [
      'BOOKING_PENDING',
      'BOOKING_CONFIRMED',
      'CONFIRMED',
      'CANCELLED',
      'RESCHEDULED',
    ]) {
      expect(buildMessage(kind, past, ctx)).toEqual({
        action: 'skip',
        reason: 'session already started',
      });
    }
    // La hora exacta de inicio ya cuenta como pasada.
    expect(
      buildMessage('CONFIRMED', session({ startsAt: now }), ctx).action,
    ).toBe('skip');
  });

  it('no omite los avisos a la educadora aunque la cita ya haya pasado', () => {
    const past = session({ startsAt: new Date('2026-10-02T11:00:00Z') });
    expect(buildMessage('GUARDIAN_CANCELLED', past, ctx).action).toBe('send');
  });

  it('omite los correos que invitan a asistir si la sesión ya no está activa', () => {
    for (const status of ['CANCELLED', 'NOT_CONFIRMED'] as const) {
      for (const kind of [
        'BOOKING_PENDING',
        'BOOKING_CONFIRMED',
        'CONFIRMED',
        'RESCHEDULED',
      ]) {
        expect(buildMessage(kind, session({ status }), ctx)).toEqual({
          action: 'skip',
          reason: `session is ${status}`,
        });
      }
    }
  });

  it('falla sin sesión o con un kind desconocido', () => {
    expect(buildMessage('CONFIRMED', null, ctx)).toEqual({
      action: 'fail',
      error: 'session not found',
    });
    expect(buildMessage('RELEASED', session(), ctx)).toEqual({
      action: 'fail',
      error: 'unknown kind: RELEASED',
    });
  });
});

describe('buildClinicalNoteMessage', () => {
  const note = {
    // Columna `@db.Date`: medianoche UTC del día de calendario.
    date: new Date('2026-10-05T00:00:00Z'),
    title: 'Trabajamos lectura',
    body: 'Practicó sílabas.',
    child: { name: 'Tomás', guardian: { name: 'Ana Pérez' } },
  };

  it('arma el correo con el contenido actual del registro', () => {
    expect(buildClinicalNoteMessage(note)).toEqual({
      action: 'send',
      message: {
        kind: 'CLINICAL_NOTE',
        childName: 'Tomás',
        guardianName: 'Ana Pérez',
        date: '2026-10-05',
        title: 'Trabajamos lectura',
        body: 'Practicó sílabas.',
      },
    });
  });

  it('omite la fila si el registro fue borrado', () => {
    expect(buildClinicalNoteMessage(null)).toEqual({
      action: 'skip',
      reason: 'clinical note deleted',
    });
  });

  it('no usa la hora de la cita ni la regla de "cita ya empezada"', () => {
    const decision = buildClinicalNoteMessage({
      ...note,
      date: new Date('2020-01-01T00:00:00Z'),
    });
    expect(decision.action).toBe('send');
  });
});
