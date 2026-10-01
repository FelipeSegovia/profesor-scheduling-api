/**
 * Mensajes de error propios del panel de la educadora. Separado de
 * `src/common/errors/messages.ts`: ese archivo es copia textual del contrato
 * congelado del apoderado y no se toca; el contrato del panel no está
 * congelado (ver `.specs/004-panel-educadora/spec.md`).
 */
export const PanelErrorMessage = {
  SESSION_NOT_FOUND: 'Sesión no encontrada.',
  GUARDIAN_NOT_FOUND: 'Apoderado no encontrado.',
  CHILD_NOT_FOUND: 'Niño no encontrado.',
  SLOT_BLOCKED: 'Ese cupo está bloqueado.',
  SLOT_NOT_EMPTY: 'Ese cupo tiene una sesión activa. Cancélala o muévela antes de bloquear.',
  INVALID_PREFERENCES:
    'La antelación del correo de serie debe ser mayor que el plazo de confirmación.',
  INVALID_RANGE: 'Revisa los valores de plazo y horizonte de reserva.',
  SERIES_EMPTY: 'Todas las fechas de la serie están ocupadas, bloqueadas o ya pasaron.',
  GUARDIAN_EXISTS: 'Ya existe un apoderado con ese correo.',
  CHILD_EXISTS: 'Ya existe un niño con ese nombre para este apoderado.',
} as const;
