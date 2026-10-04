/**
 * Backoff del despachador del outbox (spec 006): espera tras el 1.º, 2.º, 3.º
 * y 4.º intento fallido. El 5.º fallo deja la fila en `FAILED`.
 */
export const RETRY_DELAYS_MIN = [1, 5, 15, 60] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

export type RetryDecision =
  { status: 'PENDING'; nextAttemptAt: Date } | { status: 'FAILED' };

/**
 * Qué hacer con una fila después de un envío fallido. `attempts` es el total
 * de intentos **incluido** el que acaba de fallar.
 */
export function nextAttempt(attempts: number, now: Date): RetryDecision {
  if (attempts >= MAX_ATTEMPTS) return { status: 'FAILED' };
  const delayMin = RETRY_DELAYS_MIN[Math.max(attempts, 1) - 1];
  return {
    status: 'PENDING',
    nextAttemptAt: new Date(now.getTime() + delayMin * 60_000),
  };
}
