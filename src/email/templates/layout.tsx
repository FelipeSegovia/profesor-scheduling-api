import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import { colors, fonts, radius } from './theme.js';

/**
 * Las mismas familias que carga `private-profesor-scheduling/src/index.css`.
 * Apple Mail y la app de iOS la respetan; Gmail y Outlook la quitan y usan el
 * respaldo de `fonts` (`theme.ts`).
 */
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Newsreader:wght@500&display=swap';

const styles = {
  body: {
    backgroundColor: colors.background,
    color: colors.foreground,
    fontFamily: fonts.sans,
    margin: 0,
    padding: '24px 0',
  },
  container: {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    margin: '0 auto',
    maxWidth: '560px',
    padding: '32px',
  },
  brand: {
    color: colors.foreground,
    fontFamily: fonts.serif,
    fontSize: '20px',
    fontWeight: 500,
    lineHeight: '26px',
    margin: 0,
  },
  role: {
    color: colors.mutedForeground,
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 24px',
  },
  divider: { borderColor: colors.border, margin: '24px 0 16px' },
  footer: { color: colors.mutedForeground, fontSize: '12px', margin: 0 },
} as const;

/**
 * Marco común de todos los correos (spec 006): encabezado con el nombre de la
 * educadora y pie de correo automático, con la paleta de los frontends
 * (`theme.ts`). `preview` es el texto que muestran los clientes de correo
 * junto al asunto.
 */
export function Layout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="es">
      <Head>
        <link href={FONTS_URL} rel="stylesheet" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>Loreto Castillo</Text>
          <Text style={styles.role}>Educadora diferencial</Text>
          <Section>{children}</Section>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>Este es un correo automático.</Text>
        </Container>
      </Body>
    </Html>
  );
}
