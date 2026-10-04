/**
 * Sandbox de Resend (`EMAIL_REDIRECT_TO`, spec 006): sin dominio verificado,
 * Resend solo entrega a la dirección de la cuenta. Se desvía el correo a esa
 * dirección y se deja el destinatario real en el asunto para poder revisarlo.
 * Sin `redirectTo`, devuelve el correo tal cual.
 */
export function applyRedirect<T extends { to: string; subject: string }>(
  email: T,
  redirectTo: string | undefined,
): T {
  if (!redirectTo) return email;
  return {
    ...email,
    to: redirectTo,
    subject: `[para: ${email.to}] ${email.subject}`,
  };
}
