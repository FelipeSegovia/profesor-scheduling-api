import { randomBytes, createHash } from 'node:crypto';

/**
 * Token de un solo uso (confirmar/cancelar/reset de clave): 24 bytes
 * aleatorios en hex (48 caracteres), suficiente entropía para que colisionar
 * dos veces sea impracticable sin necesitar verificación de unicidad previa.
 */
export function randomToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Hash de un `randomToken()` para guardarlo en `PasswordReset.tokenHash`. No
 * se usa argon2 acá: el token ya es aleatorio de alta entropía (no una clave
 * elegida por una persona), así que un hash rápido es suficiente y evita el
 * costo de argon2 en cada intento de reset.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
