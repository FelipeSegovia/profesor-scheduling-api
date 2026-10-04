import type { OutgoingEmail } from './email-sender.js';
import { ResendEmailSender } from './resend-email.sender.js';

const email: OutgoingEmail = {
  to: 'ana@correo.cl',
  subject: 'Confirma la sesión',
  html: '<p>hola</p>',
  text: 'hola',
  idempotencyKey: 'outbox-1',
};

function fakeEmails(
  result: Awaited<ReturnType<ResendEmailSender['send']>> | 'error',
) {
  const send = vi.fn().mockResolvedValue(
    result === 'error'
      ? {
          data: null,
          error: {
            name: 'rate_limit_exceeded',
            message: 'Too many requests',
            statusCode: 429,
          },
        }
      : { data: { id: result.providerId }, error: null },
  );
  return { send };
}

describe('ResendEmailSender', () => {
  it('envía con remitente, respuesta e idempotencia y devuelve el id', async () => {
    const emails = fakeEmails({ providerId: 're-123' });
    const sender = new ResendEmailSender(emails, {
      from: 'Loreto Castillo <agenda@example.com>',
      replyTo: 'educadora@example.com',
    });

    await expect(sender.send(email)).resolves.toEqual({ providerId: 're-123' });
    expect(emails.send).toHaveBeenCalledWith(
      {
        from: 'Loreto Castillo <agenda@example.com>',
        to: 'ana@correo.cl',
        replyTo: 'educadora@example.com',
        subject: 'Confirma la sesión',
        html: '<p>hola</p>',
        text: 'hola',
      },
      { idempotencyKey: 'outbox-1' },
    );
  });

  it('sin idempotencyKey no manda opciones', async () => {
    const emails = fakeEmails({ providerId: 're-1' });
    const sender = new ResendEmailSender(emails, { from: 'a@example.com' });
    await sender.send({ ...email, idempotencyKey: undefined });
    expect(emails.send.mock.calls[0][1]).toBeUndefined();
  });

  it('con EMAIL_REDIRECT_TO desvía y deja el destinatario real en el asunto', async () => {
    const emails = fakeEmails({ providerId: 're-1' });
    const sender = new ResendEmailSender(emails, {
      from: 'onboarding@resend.dev',
      redirectTo: 'yo@example.com',
    });
    await sender.send(email);
    expect(emails.send.mock.calls[0][0]).toMatchObject({
      to: 'yo@example.com',
      subject: '[para: ana@correo.cl] Confirma la sesión',
    });
  });

  it('convierte el error de la API en excepción', async () => {
    const sender = new ResendEmailSender(fakeEmails('error'), {
      from: 'a@example.com',
    });
    await expect(sender.send(email)).rejects.toThrow(
      'Resend rate_limit_exceeded: Too many requests',
    );
  });
});
