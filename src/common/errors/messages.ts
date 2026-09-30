/**
 * Mensajes de error, copiados **textuales** de
 * `public-parents-scheduling-web/src/mocks/db.ts` y
 * `public-parents-scheduling-web/src/domain/{booking,auth}.ts`. La app pública
 * los muestra en pantalla tal cual: cambiar una palabra acá es cambiar la
 * interfaz que ve el apoderado, no un detalle interno del backend.
 */
export const ErrorMessage = {
  INVALID_AGE: 'La edad del niño debe estar entre 3 y 13 años.',
  MISSING_FIELDS: 'Completa todos los campos obligatorios.',
  EMAIL_MISMATCH:
    'El correo debe ser el de tu cuenta. Sal de tu cuenta para reservar con otro.',
  ACCOUNT_EXISTS: 'Ese correo ya tiene cuenta. Inicia sesión.',
  PAST_SLOT: 'Ese horario ya pasó.',
  SLOT_TAKEN: 'Ese cupo ya no está disponible.',
  helpRequestTooLong: (max: number) =>
    `El texto de ayuda no puede superar ${max} caracteres.`,
  INVALID_TOKEN: 'Enlace no válido.',
  NOT_PENDING: 'Esta cita ya no se puede confirmar.',
  CANCEL_NOT_ALLOWED: 'Ya no es posible cancelar esta cita.',
  NO_SESSION: 'Tu sesión expiró. Inicia sesión de nuevo.',
  NO_ACCOUNT: 'Cuenta no encontrada.',
  INVALID_RESET: 'Este enlace ya no es válido. Pide uno nuevo desde «Iniciar sesión».',
  INVALID_CREDENTIALS: 'Correo o clave incorrectos.',
  weakPassword: (min: number) => `La clave debe tener al menos ${min} caracteres.`,
  BOOKING_NOT_FOUND: 'Reserva no encontrada',
  MISSING_WEEK_START: 'Falta weekStart',
} as const;
