import type { EmailMessage } from '../email-message.js';
import { formatSessionDateTime } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, Title } from './parts.js';

type Props = Extract<EmailMessage, { kind: 'CANCELLED' }>;

/** Al apoderado: la sesión quedó cancelada (por su enlace o por la educadora). */
export function Cancelled({ childName, startsAt }: Props) {
  const when = formatSessionDateTime(startsAt);
  return (
    <Layout preview={`Sesión cancelada: ${childName}, ${when}`}>
      <Title>Sesión cancelada</Title>
      <Paragraph>
        La sesión de {childName} del {when} quedó cancelada.
      </Paragraph>
      <Paragraph>
        Si quieres agendar otra hora, puedes reservar de nuevo cuando quieras.
      </Paragraph>
    </Layout>
  );
}
