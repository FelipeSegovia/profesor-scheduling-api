import type { EmailMessage } from '../email-message.js';
import { formatSessionDateTime } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, Small, Title } from './parts.js';

type Props = Extract<
  EmailMessage,
  { kind: 'GUARDIAN_CONFIRMED' | 'GUARDIAN_CANCELLED' | 'SYSTEM_CONFIRMED' }
>;

/**
 * A la educadora: los únicos avisos por correo que recibe (regla canónica,
 * §Correos), siempre por cambios que no hizo ella. Una sola plantilla para los
 * tres casos porque solo cambian el título y la frase.
 */
export function EducatorNotice({
  kind,
  childName,
  guardianName,
  startsAt,
}: Props) {
  const when = formatSessionDateTime(startsAt);
  const copy = {
    GUARDIAN_CONFIRMED: {
      title: 'Sesión confirmada por el apoderado',
      body: `${guardianName} confirmó la sesión de ${childName} del ${when}.`,
    },
    GUARDIAN_CANCELLED: {
      title: 'Sesión cancelada por el apoderado',
      body: `${guardianName} canceló la sesión de ${childName} del ${when}. La hora quedó libre.`,
    },
    SYSTEM_CONFIRMED: {
      title: 'Nueva sesión confirmada automáticamente',
      body: `${guardianName} reservó una sesión para ${childName} el ${when}. Quedó confirmada automáticamente porque el plazo de confirmación ya había vencido.`,
    },
  }[kind];

  return (
    <Layout preview={copy.body}>
      <Title>{copy.title}</Title>
      <Paragraph>{copy.body}</Paragraph>
      <Small>Puedes ver el detalle en tu agenda.</Small>
    </Layout>
  );
}
