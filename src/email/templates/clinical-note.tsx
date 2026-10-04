import { Section, Text } from '@react-email/components';
import type { EmailMessage } from '../email-message.js';
import { formatCalendarDate } from '../format.js';
import { Layout } from './layout.js';
import { Paragraph, Small, Title } from './parts.js';
import { colors, radius } from './theme.js';

type Props = Extract<EmailMessage, { kind: 'CLINICAL_NOTE' }>;

const styles = {
  card: {
    backgroundColor: colors.secondary,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    margin: '0 0 16px',
    padding: '16px 20px',
  },
  noteTitle: {
    color: colors.foreground,
    fontSize: '16px',
    fontWeight: 600,
    lineHeight: '24px',
    margin: '0 0 8px',
  },
  noteLine: {
    color: colors.foreground,
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 8px',
  },
} as const;

/**
 * Al apoderado: la educadora agregó un registro a la ficha de su niño (spec
 * 007). Lleva el registro completo; los saltos de línea del texto se
 * conservan como un párrafo por línea, para que también salgan bien en la
 * versión texto plano.
 */
export function ClinicalNote({
  childName,
  guardianName,
  date,
  title,
  body,
}: Props) {
  const day = formatCalendarDate(date);
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '');
  return (
    <Layout preview={`${title} · ${day}`}>
      <Title>Nuevo registro en la ficha de {childName}</Title>
      <Paragraph>
        Hola {guardianName}, Loreto agregó un registro del {day} a la ficha de{' '}
        {childName}.
      </Paragraph>
      <Section style={styles.card}>
        <Text style={styles.noteTitle}>{title}</Text>
        {lines.map((line, i) => (
          <Text key={i} style={styles.noteLine}>
            {line}
          </Text>
        ))}
      </Section>
      <Small>Si tienes dudas sobre este registro, conversa con Loreto.</Small>
    </Layout>
  );
}
