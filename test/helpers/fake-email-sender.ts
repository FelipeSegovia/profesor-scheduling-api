import type {
  EmailSender,
  OutgoingEmail,
} from '../../src/email/email-sender.js';

/**
 * `EmailSender` en memoria para los e2e (spec 006): guarda cada envío en
 * `sent`, y `failNext(n)` hace que las próximas `n` llamadas lancen.
 */
export class FakeEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];
  private failures = 0;

  send(email: OutgoingEmail): Promise<{ providerId: string | null }> {
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error('fallo simulado del proveedor'));
    }
    this.sent.push(email);
    return Promise.resolve({ providerId: `fake-${this.sent.length}` });
  }

  failNext(times = 1): void {
    this.failures = times;
  }

  reset(): void {
    this.sent.length = 0;
    this.failures = 0;
  }
}
