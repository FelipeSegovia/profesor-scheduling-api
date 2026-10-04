import type { EmailMessage } from '../email-message.js';
import { formatSessionDateTime } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, SessionActions, Small, Title } from './parts.js';

type Props = Extract<EmailMessage, { kind: 'BOOKING_CONFIRMED' }>;

/**
 * Al apoderado: cita reservada que nace confirmada porque el plazo de
 * confirmación ya había vencido al reservar.
 */
export function BookingConfirmed({ childName, startsAt, cancelUrl }: Props) {
  const when = formatSessionDateTime(startsAt);
  return (
    <Layout preview={`Sesión reservada para ${childName}: ${when}`}>
      <Title>Sesión reservada</Title>
      <Paragraph>
        Quedó reservada y confirmada una sesión para {childName} el {when}.
      </Paragraph>
      <SessionActions cancelUrl={cancelUrl} />
      <Small>
        Si finalmente no puedes asistir, usa «No puedo» para liberar la hora.
      </Small>
    </Layout>
  );
}
