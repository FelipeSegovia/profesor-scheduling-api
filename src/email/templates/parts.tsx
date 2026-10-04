import {
  Button,
  Column,
  Heading,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import { colors, fonts, radius } from './theme.js';

const styles = {
  title: {
    color: colors.foreground,
    fontFamily: fonts.serif,
    fontSize: '24px',
    fontWeight: 500,
    lineHeight: '30px',
    margin: '0 0 16px',
  },
  paragraph: {
    color: colors.foreground,
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 16px',
  },
  actions: { margin: '8px 0 24px' },
  actionCell: { paddingRight: '12px', width: '1%', whiteSpace: 'nowrap' },
  primary: {
    backgroundColor: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: radius.sm,
    color: colors.primaryForeground,
    fontSize: '15px',
    fontWeight: 600,
    padding: '12px 22px',
  },
  secondary: {
    backgroundColor: colors.secondary,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    color: colors.foreground,
    fontSize: '15px',
    fontWeight: 600,
    padding: '12px 22px',
  },
  small: {
    color: colors.mutedForeground,
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 8px',
  },
  link: { color: colors.primary, textDecoration: 'underline' },
} as const;

/** Piezas comunes de las plantillas de correo (spec 006). */
export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={styles.title}>
      {children}
    </Heading>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export function Small({ children }: { children: ReactNode }) {
  return <Text style={styles.small}>{children}</Text>;
}

/**
 * Botones Confirmo / No puedo. Cualquiera de los dos puede faltar: un correo de
 * cita ya confirmada solo ofrece cancelar.
 */
export function SessionActions({
  confirmUrl,
  cancelUrl,
}: {
  confirmUrl?: string | null;
  cancelUrl?: string;
}) {
  // Una columna por botón: en HTML quedan lado a lado, y en la versión texto
  // cada uno sale en su línea (dos botones sueltos quedaban pegados).
  return (
    <Section style={styles.actions}>
      <Row>
        {confirmUrl ? (
          <Column style={styles.actionCell} data-text-block="true">
            <Button href={confirmUrl} style={styles.primary}>
              Confirmo
            </Button>
          </Column>
        ) : null}
        {cancelUrl ? (
          <Column style={styles.actionCell} data-text-block="true">
            <Button href={cancelUrl} style={styles.secondary}>
              No puedo
            </Button>
          </Column>
        ) : null}
      </Row>
    </Section>
  );
}

/** Botón de acción única (restablecer clave), con el estilo de Confirmo. */
export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={styles.actions}>
      <Button href={href} style={styles.primary}>
        {children}
      </Button>
    </Section>
  );
}

/** Enlace de respaldo en texto, para clientes que no muestran los botones. */
export function FallbackLink({ label, href }: { label: string; href: string }) {
  return (
    <Small>
      {label}:{' '}
      <Link href={href} style={styles.link}>
        {href}
      </Link>
    </Small>
  );
}
