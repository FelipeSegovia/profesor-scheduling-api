import { Logger } from '@nestjs/common';
import type { EmailSender, OutgoingEmail } from './email-sender.js';

/**
 * Transporte sin `RESEND_API_KEY` (desarrollo y e2e): escribe el correo en el
 * log en vez de enviarlo. Muestra la versión texto, que trae los enlaces
 * Confirmo / No puedo listos para copiar.
 */
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger('Email');

  send(email: OutgoingEmail): Promise<{ providerId: string | null }> {
    this.logger.log(
      `Para: ${email.to}\nAsunto: ${email.subject}\n\n${email.text.trim()}`,
    );
    return Promise.resolve({ providerId: null });
  }
}
