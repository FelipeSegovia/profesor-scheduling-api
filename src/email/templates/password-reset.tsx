import type { EmailMessage } from '../email-message.js';
import { Layout } from './layout.js';
import {
  FallbackLink,
  Paragraph,
  PrimaryButton,
  Small,
  Title,
} from './parts.js';

type Props = Extract<EmailMessage, { kind: 'PASSWORD_RESET' }>;

/** Al apoderado: enlace de un solo uso para restablecer la clave de su cuenta. */
export function PasswordReset({ resetUrl, expiresInMinutes }: Props) {
  return (
    <Layout preview="Restablece la clave de tu cuenta">
      <Title>Restablece tu clave</Title>
      <Paragraph>
        Recibimos una solicitud para restablecer la clave de tu cuenta. El
        enlace sirve una sola vez y vence en {expiresInMinutes} minutos.
      </Paragraph>
      <PrimaryButton href={resetUrl}>Restablecer clave</PrimaryButton>
      <FallbackLink
        label="Si el botón no funciona, copia este enlace"
        href={resetUrl}
      />
      <Small>
        Si no pediste este cambio, puedes ignorar este correo: tu clave sigue
        igual.
      </Small>
    </Layout>
  );
}
