import type { EmailMessage } from '../email-message.js';
import { formatSessionDateTime } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, SessionActions, Small, Title } from './parts.js';

type Props = Extract<EmailMessage, { kind: 'RESCHEDULED' }>;

/**
 * Al apoderado: la educadora movió la sesión. Si sigue pendiente se vuelve a
 * pedir confirmación; si quedó confirmada (plazo vencido), solo se ofrece
 * cancelar.
 */
export function Rescheduled({
  childName,
  startsAt,
  confirmUrl,
  cancelUrl,
}: Props) {
  const when = formatSessionDateTime(startsAt);
  return (
    <Layout preview={`Nuevo horario para ${childName}: ${when}`}>
      <Title>Cambio de horario</Title>
      <Paragraph>
        La sesión de {childName} cambió al {when}.
      </Paragraph>
      {confirmUrl ? (
        <Paragraph>
          Por favor confirma si puedes asistir en el nuevo horario.
        </Paragraph>
      ) : (
        <Paragraph>La sesión en el nuevo horario ya está confirmada.</Paragraph>
      )}
      <SessionActions confirmUrl={confirmUrl} cancelUrl={cancelUrl} />
      <Small>Si no puedes asistir, usa «No puedo» para liberar la hora.</Small>
    </Layout>
  );
}
