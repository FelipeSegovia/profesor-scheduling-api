export interface PreferencesInput {
  confirmationDeadlineHours: number;
  seriesNoticeHours: number;
  bookingHorizonWeeks: number;
}

export type PreferencesIssue = 'INVALID_PREFERENCES' | 'INVALID_RANGE';

/**
 * Regla canónica: el correo de una sesión de serie tiene que salir antes de
 * que venza el plazo de confirmación, o no tendría sentido (ya sería tarde
 * para confirmar). `null` = válido. Ver
 * `docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`, sección "Confirmación y plazo".
 */
export function validatePreferences(input: PreferencesInput): PreferencesIssue | null {
  const { confirmationDeadlineHours, seriesNoticeHours, bookingHorizonWeeks } = input;

  if (
    !Number.isInteger(confirmationDeadlineHours) ||
    !Number.isInteger(seriesNoticeHours) ||
    !Number.isInteger(bookingHorizonWeeks)
  ) {
    return 'INVALID_RANGE';
  }
  if (confirmationDeadlineHours < 1 || bookingHorizonWeeks < 1 || bookingHorizonWeeks > 52) {
    return 'INVALID_RANGE';
  }
  if (seriesNoticeHours <= confirmationDeadlineHours) {
    return 'INVALID_PREFERENCES';
  }
  return null;
}
