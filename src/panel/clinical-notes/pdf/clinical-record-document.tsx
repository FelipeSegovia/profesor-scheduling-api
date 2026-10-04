import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  formatCalendarDate,
  formatCalendarDateWithYear,
} from '../../../email/format.js';
import { colors, radius } from '../../../email/templates/theme.js';
import {
  FRAME_INSET,
  HeartNote,
  Pencil,
  Star,
  WavySheet,
} from './decorations.js';
import { pdfFonts } from './fonts.js';

/** Lo que el PDF muestra de un registro. Ya viene en el orden en que se imprime. */
export interface ClinicalRecordNote {
  /** `YYYY-MM-DD`. */
  date: string;
  title: string;
  body: string;
  /** Sesión de la agenda vinculada, si la hay (`date` `YYYY-MM-DD`, `time` `HH:mm`). */
  session: { date: string; time: string } | null;
}

export interface ClinicalRecordData {
  child: { name: string; age: number };
  guardian: { name: string; email: string; phone: string };
  /** Educadora que exporta (la autenticada). */
  educator: { name: string };
  /** Día de la exportación, `YYYY-MM-DD` (Chile). */
  exportedOn: string;
  notes: ClinicalRecordNote[];
}

const TITLE = 'Ficha del alumno';
/** Colores que rotan las letras del título, como en una hoja escolar. */
const TITLE_COLORS = [
  colors.primary,
  colors.warning,
  colors.success,
  colors.mutedForeground,
];
/** Fondos pastel que rotan los bloques de los registros. */
const NOTE_BACKGROUNDS = [
  colors.secondary,
  colors.successSoft,
  colors.warningSoft,
];

/** Margen del texto: el del marco más aire para que nada pise el borde ondulado. */
const CONTENT_X = FRAME_INSET + 34;

// `lineHeight` va en cada texto y **no** en `page`: con un registro largo que
// cruza de página, un `lineHeight` heredado por el pie `fixed` hace que
// `@react-pdf/renderer` 4.9 falle con "unsupported number: -1.8e21". Se
// reproduce con pie fijo + estilo de página + `lineHeight` + texto con
// muchos saltos de línea; quitar cualquiera de los tres lo evita.
//
// Y cada estilo con `lineHeight` declara su propio `fontSize`: en 4.9 un
// `lineHeight` sin unidad se multiplica por el `fontSize` del mismo estilo, y
// si no lo tiene usa el por defecto (18), no el heredado de `page`. Sin eso,
// `lineHeight: 1.5` da 27 pt de interlineado en vez de 15,75.
const BODY_SIZE = 10.5;

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.border,
    color: colors.foreground,
    fontFamily: pdfFonts.sans,
    fontSize: BODY_SIZE,
    paddingBottom: 84,
    paddingHorizontal: CONTENT_X,
    paddingTop: FRAME_INSET + 30,
  },
  header: { marginBottom: 16, position: 'relative' },
  title: {
    fontFamily: pdfFonts.serif,
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: 1.5,
    lineHeight: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  heart: { left: -8, position: 'absolute', top: -4 },
  star: { position: 'absolute', right: -6, top: -2 },
  fieldRow: {
    borderRadius: radius.lg,
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  field: { flex: 1, fontSize: 11, lineHeight: 1.4, paddingRight: 8 },
  label: { color: colors.primary, fontWeight: 500 },
  guardian: {
    color: colors.mutedForeground,
    fontSize: 9,
    lineHeight: 1.4,
    marginTop: 2,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    color: colors.primary,
    fontFamily: pdfFonts.serif,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.3,
    marginBottom: 10,
    marginTop: 18,
    paddingBottom: 4,
  },
  note: {
    borderRadius: radius.lg,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noteHead: { marginBottom: 6 },
  noteDate: {
    color: colors.primary,
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    lineHeight: 1.4,
    textTransform: 'uppercase',
  },
  noteTitle: {
    fontFamily: pdfFonts.serif,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  noteSession: { color: colors.mutedForeground, fontSize: 9, lineHeight: 1.4 },
  noteBody: { fontSize: BODY_SIZE, lineHeight: 1.5 },
  empty: {
    color: colors.mutedForeground,
    fontSize: BODY_SIZE,
    lineHeight: 1.5,
  },
  footer: {
    bottom: FRAME_INSET + 22,
    color: colors.mutedForeground,
    flexDirection: 'row',
    fontSize: 8.5,
    justifyContent: 'space-between',
    left: CONTENT_X,
    position: 'absolute',
    // Deja libre la esquina del lápiz.
    right: CONTENT_X + 44,
  },
  pencil: { bottom: 4, position: 'absolute', right: 2 },
});

/**
 * Título con cada letra de un color; los espacios no consumen color. `split('')`
 * basta: el título es fijo y sin emojis.
 */
function ColorfulTitle({ text }: { text: string }) {
  let colored = 0;
  return (
    <Text style={styles.title}>
      {text.split('').map((char, i) =>
        char === ' ' ? (
          ' '
        ) : (
          <Text
            key={i}
            style={{ color: TITLE_COLORS[colored++ % TITLE_COLORS.length] }}
          >
            {char}
          </Text>
        ),
      )}
    </Text>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.field}>
      <Text style={styles.label}>{label}: </Text>
      {value}
    </Text>
  );
}

/**
 * PDF del historial completo de la ficha clínica de un niño (spec 007).
 * Componente puro: recibe los datos ya cargados y ordenados.
 */
export function ClinicalRecordDocument({
  child,
  guardian,
  educator,
  exportedOn,
  notes,
}: ClinicalRecordData) {
  return (
    <Document
      title={`Ficha de ${child.name}`}
      author={educator.name}
      subject="Ficha clínica"
    >
      <Page size="A4" style={styles.page}>
        <WavySheet />

        <View style={styles.header}>
          <ColorfulTitle text={TITLE} />
          <HeartNote size={40} style={styles.heart} />
          <Star size={28} style={styles.star} />
        </View>

        <View
          style={[styles.fieldRow, { backgroundColor: colors.warningSoft }]}
        >
          <Field label="Nombre" value={child.name} />
          <Field label="Educadora" value={educator.name} />
        </View>
        <View
          style={[styles.fieldRow, { backgroundColor: colors.successSoft }]}
        >
          <Field label="Edad" value={`${child.age} años`} />
          <Field label="Fecha" value={formatCalendarDateWithYear(exportedOn)} />
        </View>
        <Text style={styles.guardian}>
          Apoderado: {guardian.name} · {guardian.email} · {guardian.phone}
        </Text>

        <Text style={styles.sectionTitle} minPresenceAhead={60}>
          Registros
        </Text>

        {notes.length === 0 ? (
          <View style={[styles.note, { backgroundColor: colors.secondary }]}>
            <Text style={styles.empty}>Sin registros.</Text>
          </View>
        ) : (
          notes.map((note, i) => (
            <View
              key={i}
              style={[
                styles.note,
                {
                  backgroundColor:
                    NOTE_BACKGROUNDS[i % NOTE_BACKGROUNDS.length],
                },
              ]}
            >
              {/* El encabezado no se separa de la primera línea del texto. */}
              <View style={styles.noteHead} wrap={false} minPresenceAhead={20}>
                <Text style={styles.noteDate}>
                  {formatCalendarDateWithYear(note.date)}
                </Text>
                <Text style={styles.noteTitle}>{note.title}</Text>
                {note.session ? (
                  <Text style={styles.noteSession}>
                    Sesión del {formatCalendarDate(note.session.date)},{' '}
                    {note.session.time}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.noteBody}>{note.body}</Text>
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>{educator.name} · Educadora diferencial</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
        <Pencil size={64} style={styles.pencil} fixed />
      </Page>
    </Document>
  );
}
