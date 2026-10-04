import type { EmailMessage } from './email-message.js';
import { renderEmail } from './render-email.js';

// Lunes 5 de octubre de 2026, 19:00 en Chile. Plazo de 24 h: domingo 4, 19:00.
const startsAt = new Date('2026-10-05T22:00:00Z');
const confirmBy = new Date('2026-10-04T22:00:00Z');
const confirmUrl = 'http://localhost:5173/sesion/tok-confirm/confirmar';
const cancelUrl = 'http://localhost:5173/sesion/tok-cancel/cancelar';
const when = 'lunes 5 de octubre, 19:00';

const guardianMessages: EmailMessage[] = [
  {
    kind: 'BOOKING_PENDING',
    childName: 'Tomás',
    startsAt,
    confirmBy,
    confirmUrl,
    cancelUrl,
  },
  { kind: 'BOOKING_CONFIRMED', childName: 'Tomás', startsAt, cancelUrl },
  { kind: 'CONFIRMED', childName: 'Tomás', startsAt, cancelUrl },
  { kind: 'CANCELLED', childName: 'Tomás', startsAt },
  { kind: 'RESCHEDULED', childName: 'Tomás', startsAt, confirmUrl, cancelUrl },
];

const educatorMessages: EmailMessage[] = [
  {
    kind: 'GUARDIAN_CONFIRMED',
    childName: 'Tomás',
    guardianName: 'Ana Pérez',
    startsAt,
  },
  {
    kind: 'GUARDIAN_CANCELLED',
    childName: 'Tomás',
    guardianName: 'Ana Pérez',
    startsAt,
  },
  {
    kind: 'SYSTEM_CONFIRMED',
    childName: 'Tomás',
    guardianName: 'Ana Pérez',
    startsAt,
  },
];

describe('renderEmail', () => {
  it.each([...guardianMessages, ...educatorMessages])(
    '$kind: asunto, HTML y texto con el niño y la fecha en hora de Chile',
    async (message) => {
      const email = await renderEmail(message);
      expect(email.subject).toContain('Tomás');
      expect(email.html).toContain('lang="es"');
      expect(email.html).toContain('Loreto Castillo');
      expect(email.html).toContain('Educadora diferencial');
      // Paleta de los frontends (`templates/theme.ts`).
      expect(email.html).toContain('#fff2eb');
      expect(email.text).toContain('Tomás');
      expect(email.text).toContain(when);
    },
  );

  it('BOOKING_PENDING: botones Confirmo y No puedo, y el plazo', async () => {
    const email = await renderEmail(guardianMessages[0]);
    expect(email.subject).toBe(
      'Confirma la sesión de Tomás del lunes 5 de octubre',
    );
    expect(email.html).toContain(`href="${confirmUrl}"`);
    expect(email.html).toContain(`href="${cancelUrl}"`);
    expect(email.text).toContain('domingo 4 de octubre, 19:00');
    // La versión texto conserva los enlaces para clientes sin HTML.
    // Cada botón en su línea, no pegados.
    const lines = email.text.split('\n');
    expect(lines).toContain(`Confirmo ${confirmUrl}`);
    expect(lines).toContain(`No puedo ${cancelUrl}`);
  });

  it('BOOKING_CONFIRMED y CONFIRMED: solo No puedo', async () => {
    for (const message of guardianMessages.slice(1, 3)) {
      const email = await renderEmail(message);
      expect(email.html).toContain(`href="${cancelUrl}"`);
      expect(email.html).not.toContain('Confirmo');
    }
  });

  it('CANCELLED: sin enlaces de sesión', async () => {
    const email = await renderEmail(guardianMessages[3]);
    expect(email.html).not.toContain('/sesion/');
  });

  it('RESCHEDULED: pide confirmar solo si sigue pendiente', async () => {
    const pending = await renderEmail(guardianMessages[4]);
    expect(pending.html).toContain(`href="${confirmUrl}"`);

    const confirmed = await renderEmail({
      kind: 'RESCHEDULED',
      childName: 'Tomás',
      startsAt,
      confirmUrl: null,
      cancelUrl,
    });
    expect(confirmed.html).not.toContain('Confirmo');
    expect(confirmed.html).toContain(`href="${cancelUrl}"`);
    expect(confirmed.text).toContain('ya está confirmada');
  });

  it('los correos a la educadora nombran al apoderado', async () => {
    for (const message of educatorMessages) {
      const email = await renderEmail(message);
      expect(email.subject).toContain('Tomás');
      expect(email.text).toContain('Ana Pérez');
      expect(email.html).not.toContain('/sesion/');
    }
  });

  it('los correos al apoderado ignoran datos de más (no filtran a terceros)', async () => {
    for (const message of guardianMessages) {
      // Un llamador que, saltándose los tipos, pasa el nombre de otra persona.
      const leaky = {
        ...message,
        guardianName: 'Otra Familia',
      } as EmailMessage;
      const email = await renderEmail(leaky);
      expect(email.html).not.toContain('Otra Familia');
      expect(email.text).not.toContain('Otra Familia');
      expect(email.subject).not.toContain('Otra Familia');
    }
  });

  it('escapa el HTML en los nombres', async () => {
    const email = await renderEmail({
      ...guardianMessages[3],
      childName: '<b>Tomás</b>',
    } as EmailMessage);
    expect(email.html).not.toContain('<b>Tomás</b>');
    expect(email.html).toContain('&lt;b&gt;');
  });

  it('PASSWORD_RESET: enlace y vencimiento', async () => {
    const resetUrl = 'http://localhost:5173/cuenta/restablecer/tok-reset';
    const email = await renderEmail({
      kind: 'PASSWORD_RESET',
      resetUrl,
      expiresInMinutes: 60,
    });
    expect(email.subject).toBe('Restablece la clave de tu cuenta');
    expect(email.html).toContain(`href="${resetUrl}"`);
    expect(email.text).toContain(resetUrl);
    expect(email.text).toContain('60 minutos');
  });

  describe('CLINICAL_NOTE', () => {
    const note: EmailMessage = {
      kind: 'CLINICAL_NOTE',
      childName: 'Tomás',
      guardianName: 'Ana Pérez',
      date: '2026-10-05',
      title: 'Trabajamos lectura',
      body: 'Practicó las sílabas trabadas.\n\nLe costó la letra "r".',
    };

    it('asunto, saludo, fecha de calendario, título y texto', async () => {
      const email = await renderEmail(note);
      expect(email.subject).toBe('Nuevo registro en la ficha de Tomás');
      expect(email.text).toContain('Hola Ana Pérez');
      expect(email.text).toContain('lunes 5 de octubre');
      expect(email.text).toContain('Trabajamos lectura');
      expect(email.text).toContain('Practicó las sílabas trabadas.');
      expect(email.html).toContain('Trabajamos lectura');
    });

    it('conserva los saltos de línea como líneas separadas en el texto', async () => {
      const lines = (await renderEmail(note)).text.split('\n');
      expect(lines).toContain('Practicó las sílabas trabadas.');
      expect(lines.some((l) => l.includes('Le costó la letra'))).toBe(true);
    });

    it('no lleva enlaces de sesión ni hora', async () => {
      const email = await renderEmail(note);
      expect(email.html).not.toContain('/sesion/');
      expect(email.text).not.toMatch(/\d{2}:\d{2}/);
    });

    it('escapa el HTML del texto de la educadora', async () => {
      const email = await renderEmail({
        ...note,
        title: '<script>alert(1)</script>',
        body: '<b>negrita</b>',
      } as EmailMessage);
      expect(email.html).not.toContain('<script>alert(1)</script>');
      expect(email.html).not.toContain('<b>negrita</b>');
      expect(email.html).toContain('&lt;b&gt;negrita');
    });
  });
});
