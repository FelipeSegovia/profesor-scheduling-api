/** Correo listo para enviar: `renderEmail` más el destinatario. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Evita duplicados si se reintenta tras un timeout: el despachador del
   * outbox usa el `id` de la fila.
   */
  idempotencyKey?: string;
}

/**
 * Transporte de correo (spec 006). Lanza si el envío falla; el despachador
 * del outbox decide si reintentar. `providerId` es el id del proveedor, o
 * `null` cuando no hubo envío real (transporte de consola).
 */
export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ providerId: string | null }>;
}

/** Token de inyección de `EmailSender`; los e2e lo reemplazan por uno falso. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
