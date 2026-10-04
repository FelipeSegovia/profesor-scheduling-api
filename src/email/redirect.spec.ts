import { applyRedirect } from './redirect.js';

describe('applyRedirect', () => {
  const email = {
    to: 'ana@correo.cl',
    subject: 'Confirma la sesión',
    html: '<p>x</p>',
  };

  it('sin dirección de desvío deja el correo igual', () => {
    expect(applyRedirect(email, undefined)).toBe(email);
  });

  it('desvía al destinatario de prueba y deja el real en el asunto', () => {
    expect(applyRedirect(email, 'yo@example.com')).toEqual({
      to: 'yo@example.com',
      subject: '[para: ana@correo.cl] Confirma la sesión',
      html: '<p>x</p>',
    });
  });
});
