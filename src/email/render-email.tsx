import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import type { EmailMessage } from './email-message.js';
import { formatSessionDate } from './format.js';
import { BookingConfirmed } from './templates/booking-confirmed.js';
import { BookingPending } from './templates/booking-pending.js';
import { Cancelled } from './templates/cancelled.js';
import { ClinicalNote } from './templates/clinical-note.js';
import { Confirmed } from './templates/confirmed.js';
import { EducatorNotice } from './templates/educator-notice.js';
import { PasswordReset } from './templates/password-reset.js';
import { Rescheduled } from './templates/rescheduled.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Convierte un mensaje en asunto, HTML y texto plano (spec 006). Puro: sin
 * Nest ni BD. El `switch` es exhaustivo: agregar un `kind` a `EmailMessage`
 * sin plantilla no compila.
 */
export async function renderEmail(
  message: EmailMessage,
): Promise<RenderedEmail> {
  const { subject, element } = compose(message);
  const [html, text] = await Promise.all([
    render(element),
    render(element, {
      plainText: true,
      htmlToTextOptions: { selectors: PLAIN_TEXT_SELECTORS },
    }),
  ]);
  return { subject, html, text };
}

/**
 * En la versión texto, las celdas marcadas con `data-text-block` (los botones
 * Confirmo / No puedo, `templates/parts.tsx`) salen cada una en su línea; por
 * defecto `html-to-text` las pega en una sola.
 */
const PLAIN_TEXT_SELECTORS = [
  { selector: 'td[data-text-block]', format: 'block' },
];

function compose(message: EmailMessage): {
  subject: string;
  element: ReactElement;
} {
  switch (message.kind) {
    case 'BOOKING_PENDING':
      return {
        subject: `Confirma la sesión de ${message.childName} del ${formatSessionDate(message.startsAt)}`,
        element: <BookingPending {...message} />,
      };
    case 'BOOKING_CONFIRMED':
      return {
        subject: `Sesión reservada: ${message.childName}, ${formatSessionDate(message.startsAt)}`,
        element: <BookingConfirmed {...message} />,
      };
    case 'CONFIRMED':
      return {
        subject: `Sesión confirmada: ${message.childName}, ${formatSessionDate(message.startsAt)}`,
        element: <Confirmed {...message} />,
      };
    case 'CANCELLED':
      return {
        subject: `Sesión cancelada: ${message.childName}, ${formatSessionDate(message.startsAt)}`,
        element: <Cancelled {...message} />,
      };
    case 'RESCHEDULED':
      return {
        subject: `Cambio de horario: sesión de ${message.childName}`,
        element: <Rescheduled {...message} />,
      };
    case 'GUARDIAN_CONFIRMED':
      return {
        subject: `${message.guardianName} confirmó la sesión de ${message.childName}`,
        element: <EducatorNotice {...message} />,
      };
    case 'GUARDIAN_CANCELLED':
      return {
        subject: `${message.guardianName} canceló la sesión de ${message.childName}`,
        element: <EducatorNotice {...message} />,
      };
    case 'SYSTEM_CONFIRMED':
      return {
        subject: `Nueva sesión confirmada: ${message.childName}, ${formatSessionDate(message.startsAt)}`,
        element: <EducatorNotice {...message} />,
      };
    case 'CLINICAL_NOTE':
      return {
        subject: `Nuevo registro en la ficha de ${message.childName}`,
        element: <ClinicalNote {...message} />,
      };
    case 'PASSWORD_RESET':
      return {
        subject: 'Restablece la clave de tu cuenta',
        element: <PasswordReset {...message} />,
      };
    default: {
      const unreachable: never = message;
      throw new Error(`Correo sin plantilla: ${JSON.stringify(unreachable)}`);
    }
  }
}
