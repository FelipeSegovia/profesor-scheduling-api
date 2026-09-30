/**
 * Portado de `public-parents-scheduling-web/src/domain/auth.ts`. Se dejan
 * fuera `getPasswordErrors` y `PASSWORD_MISMATCH_MESSAGE`: son validación de
 * formulario (confirmar clave dos veces), no una regla de negocio del backend.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
