import type { Resend } from 'resend';
import type { EmailSender, OutgoingEmail } from './email-sender.js';
import { applyRedirect } from './redirect.js';

export interface ResendSenderOptions {
  from: string;
  replyTo?: string;
  /** `EMAIL_REDIRECT_TO`: sandbox de Resend, ver `redirect.ts`. */
  redirectTo?: string;
}

/**
 * Envía por la API de Resend. Recibe solo `emails` del cliente para poder
 * probarlo sin red. Resend no lanza en los errores de la API: devuelve
 * `{ error }`, y aquí se convierte en excepción para que el despachador
 * reintente.
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly emails: Pick<Resend['emails'], 'send'>,
    private readonly options: ResendSenderOptions,
  ) {}

  async send(email: OutgoingEmail): Promise<{ providerId: string | null }> {
    const { to, subject, html, text } = applyRedirect(
      email,
      this.options.redirectTo,
    );
    const { data, error } = await this.emails.send(
      {
        from: this.options.from,
        to,
        replyTo: this.options.replyTo,
        subject,
        html,
        text,
      },
      email.idempotencyKey
        ? { idempotencyKey: email.idempotencyKey }
        : undefined,
    );
    if (error) {
      throw new Error(`Resend ${error.name}: ${error.message}`);
    }
    return { providerId: data.id };
  }
}
