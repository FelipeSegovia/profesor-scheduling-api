import type { EmailMessage } from '../email-message.js';
import { formatSessionDateTime } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, SessionActions, Small, Title } from './parts.js';

type Props = Extract<EmailMessage, { kind: 'BOOKING_PENDING' }>;

/** Al apoderado: cita reservada que todavía debe confirmar. */
export function BookingPending({
  childName,
  startsAt,
  confirmBy,
  confirmUrl,
  cancelUrl,
}: Props) {
  const when = formatSessionDateTime(startsAt);
  return (
    <Layout preview={`Confirma la sesión de ${childName}: ${when}`}>
      <Title>Confirma la sesión de {childName}</Title>
      <Paragraph>
        Quedó reservada una sesión para {childName} el {when}.
      </Paragraph>
      <Paragraph>
        Por favor confírmala antes del {formatSessionDateTime(confirmBy)}. Si no
        se confirma a tiempo, la hora se libera para otra familia.
      </Paragraph>
      <SessionActions confirmUrl={confirmUrl} cancelUrl={cancelUrl} />
      <Small>Si no puedes asistir, usa «No puedo» para liberar la hora.</Small>
    </Layout>
  );
}
