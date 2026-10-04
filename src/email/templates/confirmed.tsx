import type { EmailMessage } from '../email-message.js';
import { formatSessionDateTime } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, SessionActions, Small, Title } from './parts.js';

type Props = Extract<EmailMessage, { kind: 'CONFIRMED' }>;

/** Al apoderado: la sesión quedó confirmada (por su enlace o por la educadora). */
export function Confirmed({ childName, startsAt, cancelUrl }: Props) {
  const when = formatSessionDateTime(startsAt);
  return (
    <Layout preview={`Sesión confirmada: ${childName}, ${when}`}>
      <Title>Sesión confirmada</Title>
      <Paragraph>
        La sesión de {childName} del {when} está confirmada. ¡Nos vemos!
      </Paragraph>
      <SessionActions cancelUrl={cancelUrl} />
      <Small>
        Si finalmente no puedes asistir, usa «No puedo» para liberar la hora.
      </Small>
    </Layout>
  );
}
