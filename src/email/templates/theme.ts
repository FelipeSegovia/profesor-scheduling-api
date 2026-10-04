/**
 * Paleta y tipografía de los correos, copiadas del tema claro que comparten
 * los dos frontends (`:root` de `public-parents-scheduling-web/src/index.css`
 * y `private-profesor-scheduling/src/index.css`). Los correos no tienen modo
 * oscuro: muchos clientes lo ignoran o lo fuerzan mal, así que se fija el tema
 * claro. Si cambia la paleta de los frontends, actualizar aquí. El PDF de la
 * ficha clínica (`src/panel/clinical-notes/pdf/`) usa la misma paleta.
 */
export const colors = {
  background: '#fff2eb',
  card: '#fffbfa',
  foreground: '#4a2430',
  primary: '#8e3048',
  primaryForeground: '#fffbfa',
  secondary: '#ffebef',
  muted: '#fee2e1',
  mutedForeground: '#7d5560',
  border: '#fed8d2',
  // Los usa el PDF de la ficha clínica (bloques pastel), no los correos.
  success: '#3d7a5a',
  successSoft: '#e8f5ee',
  warning: '#9a6b2f',
  warningSoft: '#fef3e2',
} as const;

/** `--radius` de los frontends (0.875rem); `sm` es su `--radius-sm`. */
export const radius = { lg: '14px', sm: '8px' } as const;

/**
 * DM Sans (texto) y Newsreader (títulos), como en los frontends. Se cargan con
 * `<Font>` desde Google Fonts; los clientes que no admiten fuentes web usan
 * el respaldo.
 */
export const fonts = {
  sans: '"DM Sans", Helvetica, Arial, sans-serif',
  serif: 'Newsreader, Georgia, "Times New Roman", serif',
} as const;
