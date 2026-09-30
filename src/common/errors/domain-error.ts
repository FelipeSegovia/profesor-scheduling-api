/**
 * Códigos de error del contrato público congelado, portados literalmente de
 * `public-parents-scheduling-web/src/mocks/db.ts`. La app pública los usa para
 * decidir qué mostrar (p. ej. reintentar en `SLOT_TAKEN`), así que agregar,
 * quitar o renombrar uno de acá es un cambio de contrato, no un detalle interno.
 */
export const ErrorCode = {
  INVALID_AGE: 'INVALID_AGE',
  MISSING_FIELDS: 'MISSING_FIELDS',
  EMAIL_MISMATCH: 'EMAIL_MISMATCH',
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  PAST_SLOT: 'PAST_SLOT',
  SLOT_TAKEN: 'SLOT_TAKEN',
  HELP_REQUEST_TOO_LONG: 'HELP_REQUEST_TOO_LONG',
  INVALID_TOKEN: 'INVALID_TOKEN',
  NOT_PENDING: 'NOT_PENDING',
  CANCEL_NOT_ALLOWED: 'CANCEL_NOT_ALLOWED',
  NO_SESSION: 'NO_SESSION',
  NO_ACCOUNT: 'NO_ACCOUNT',
  INVALID_RESET: 'INVALID_RESET',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Excepción de dominio. Equivalente al `httpError()` de `db.ts`: mensaje en
 * español (lo que ve el apoderado), status HTTP y código en inglés.
 *
 * `code` es opcional: dos respuestas del contrato congelado no llevan código
 * (`Reserva no encontrada`, `Falta weekStart`). El filtro global omite la
 * clave `code` en la respuesta cuando no viene, en vez de emitir `code: null`.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly code?: ErrorCodeValue;

  constructor(message: string, status: number, code?: ErrorCodeValue) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
  }
}
