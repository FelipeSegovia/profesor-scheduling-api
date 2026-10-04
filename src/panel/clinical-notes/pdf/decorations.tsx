import { G, Path, Polygon, Rect, Svg } from '@react-pdf/renderer';
import type { ComponentProps } from 'react';
import { colors } from '../../../email/templates/theme.js';

// `@react-pdf/renderer` no reexporta su tipo `Style`.
type Style = ComponentProps<typeof Svg>['style'];

/** Tamaño de una página A4 en puntos, el de `<Page size="A4">`. */
export const A4 = { width: 595.28, height: 841.89 } as const;

/** Distancia del borde de la página a la hoja ondulada del marco. */
export const FRAME_INSET = 18;

/**
 * Contorno de un rectángulo con los bordes ondulados (curvas cuadráticas que
 * alternan hacia afuera y hacia adentro), como una hoja recortada.
 */
function wavyRect(
  x: number,
  y: number,
  width: number,
  height: number,
  step: number,
  amplitude: number,
): string {
  const parts = [`M ${x} ${y}`];
  const edge = (
    length: number,
    point: (t: number) => [number, number],
    control: (t: number, offset: number) => [number, number],
  ) => {
    const n = Math.max(2, Math.round(length / step));
    for (let i = 0; i < n; i++) {
      const offset = i % 2 === 0 ? -amplitude : amplitude;
      const [cx, cy] = control((i + 0.5) / n, offset);
      const [px, py] = point((i + 1) / n);
      parts.push(
        `Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)}`,
      );
    }
  };
  const right = x + width;
  const bottom = y + height;
  edge(
    width,
    (t) => [x + width * t, y],
    (t, o) => [x + width * t, y + o],
  );
  edge(
    height,
    (t) => [right, y + height * t],
    (t, o) => [right - o, y + height * t],
  );
  edge(
    width,
    (t) => [right - width * t, bottom],
    (t, o) => [right - width * t, bottom - o],
  );
  edge(
    height,
    (t) => [x, bottom - height * t],
    (t, o) => [x + o, bottom - height * t],
  );
  parts.push('Z');
  return parts.join(' ');
}

const SHEET_PATH = wavyRect(
  FRAME_INSET,
  FRAME_INSET,
  A4.width - FRAME_INSET * 2,
  A4.height - FRAME_INSET * 2,
  22,
  3.5,
);

/**
 * Hoja de color `card` con borde ondulado sobre el fondo de la página. Va
 * `fixed` y como primer hijo de `Page`, para quedar detrás del contenido en
 * todas las páginas.
 */
export function WavySheet() {
  return (
    <Svg
      fixed
      width={A4.width}
      height={A4.height}
      viewBox={`0 0 ${A4.width} ${A4.height}`}
      style={{ left: 0, position: 'absolute', top: 0 }}
    >
      <Path d={SHEET_PATH} fill={colors.card} />
    </Svg>
  );
}

const HEART_PATH =
  'M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3 3.7 0 5.9 3.8 4.4 7.3C19.5 16.4 12 21 12 21z';

/** Nota adhesiva inclinada con un corazón, como la de la hoja de referencia. */
export function HeartNote({ size, style }: { size: number; style?: Style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" style={style}>
      <G transform="rotate(-12 20 20)">
        <Rect
          x={5}
          y={5}
          width={30}
          height={30}
          rx={6}
          fill={colors.secondary}
          stroke={colors.border}
          strokeWidth={1.2}
        />
        <G transform="translate(9 9) scale(0.92)">
          <Path
            d={HEART_PATH}
            fill="none"
            stroke={colors.primary}
            strokeWidth={1.8}
          />
        </G>
      </G>
    </Svg>
  );
}

/** Puntas de una estrella de 5 puntas centrada en (12, 12). */
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 11 : 4.6;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** Estrella de contorno, inclinada. */
export function Star({ size, style }: { size: number; style?: Style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <G transform="rotate(14 12 12)">
        <Polygon
          points={STAR_POINTS}
          fill={colors.warningSoft}
          stroke={colors.warning}
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}

/** Lápiz en diagonal, con la punta hacia abajo a la izquierda. */
export function Pencil({
  size,
  style,
  fixed,
}: {
  size: number;
  style?: Style;
  fixed?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      style={style}
      fixed={fixed}
    >
      {/* Se dibuja horizontal (punta a la derecha) y se gira. */}
      <G transform="rotate(135 40 40) translate(4 33)">
        <Rect
          x={0}
          y={0}
          width={10}
          height={14}
          rx={3}
          fill={colors.border}
          stroke={colors.primary}
          strokeWidth={1}
        />
        <Rect
          x={10}
          y={0}
          width={6}
          height={14}
          fill={colors.mutedForeground}
        />
        <Rect
          x={16}
          y={0}
          width={40}
          height={14}
          fill={colors.warningSoft}
          stroke={colors.warning}
          strokeWidth={1}
        />
        <Path
          d="M16 4.7 H56 M16 9.3 H56"
          stroke={colors.warning}
          strokeWidth={0.6}
        />
        <Polygon
          points="56,0 72,7 56,14"
          fill={colors.background}
          stroke={colors.warning}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <Polygon points="67,4.8 72,7 67,9.2" fill={colors.foreground} />
      </G>
    </Svg>
  );
}
