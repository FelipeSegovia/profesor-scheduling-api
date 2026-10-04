/**
 * Datos de cada correo (spec 006), como unión discriminada por `kind`. Cada
 * variante trae solo lo que su plantilla muestra: así, por tipos, un correo al
 * apoderado no puede recibir datos de otra persona (solo su niño y su cita).
 * El destinatario no va aquí: lo fija quien envía (`OutboxEmail.recipient`).
 *
 * Los `kind` de sesión coinciden con `OutboxKind` (`src/outbox/outbox.service.ts`);
 * `CLINICAL_NOTE` sí (spec 007); `PASSWORD_RESET` no pasa por el outbox.
 */
export type EmailMessage =
  | WithKind<
      'BOOKING_PENDING',
      {
        childName: string;
        startsAt: Date;
        /** Último momento para confirmar: `startsAt − confirmationDeadlineHours`. */
        confirmBy: Date;
        confirmUrl: string;
        cancelUrl: string;
      }
    >
  | WithKind<
      'BOOKING_CONFIRMED' | 'CONFIRMED',
      { childName: string; startsAt: Date; cancelUrl: string }
    >
  | WithKind<'CANCELLED', { childName: string; startsAt: Date }>
  | WithKind<
      'RESCHEDULED',
      {
        childName: string;
        startsAt: Date;
        /** Solo si la sesión sigue `PENDING` después de moverla. */
        confirmUrl: string | null;
        cancelUrl: string;
      }
    >
  | WithKind<
      'GUARDIAN_CONFIRMED' | 'GUARDIAN_CANCELLED' | 'SYSTEM_CONFIRMED',
      { childName: string; guardianName: string; startsAt: Date }
    >
  | WithKind<'PASSWORD_RESET', { resetUrl: string; expiresInMinutes: number }>
  /** Al apoderado, cuando la educadora agrega un registro a la ficha de su niño (spec 007). */
  | WithKind<
      'CLINICAL_NOTE',
      {
        childName: string;
        guardianName: string;
        /** Día del registro, `YYYY-MM-DD` (fecha de calendario, no un instante). */
        date: string;
        title: string;
        body: string;
      }
    >;

/**
 * Una variante por cada `kind`, aunque compartan campos. Con
 * `{ kind: 'A' | 'B' } & T` en una sola variante, `Extract<EmailMessage,
 * { kind: 'A' }>` daría `never` y las props de la plantilla quedarían sin tipo.
 */
type WithKind<K extends string, T> = K extends unknown
  ? { kind: K } & T
  : never;

export type EmailKind = EmailMessage['kind'];
