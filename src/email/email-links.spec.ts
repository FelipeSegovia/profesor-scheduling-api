import { cancelUrl, confirmUrl, resetPasswordUrl } from './email-links.js';

describe('enlaces de los correos', () => {
  it('arma las rutas del front público', () => {
    const base = 'http://localhost:5173';
    expect(confirmUrl(base, 'abc')).toBe(
      'http://localhost:5173/sesion/abc/confirmar',
    );
    expect(cancelUrl(base, 'def')).toBe(
      'http://localhost:5173/sesion/def/cancelar',
    );
    expect(resetPasswordUrl(base, 'ghi')).toBe(
      'http://localhost:5173/cuenta/restablecer/ghi',
    );
  });

  it('acepta la base con o sin barra final', () => {
    expect(confirmUrl('https://agenda.cl/', 'abc')).toBe(
      'https://agenda.cl/sesion/abc/confirmar',
    );
    expect(confirmUrl('https://agenda.cl', 'abc')).toBe(
      'https://agenda.cl/sesion/abc/confirmar',
    );
  });

  it('conserva una subruta en la base', () => {
    expect(cancelUrl('https://x.cl/agenda/', 'abc')).toBe(
      'https://x.cl/agenda/sesion/abc/cancelar',
    );
  });

  it('codifica el token', () => {
    expect(resetPasswordUrl('https://x.cl', 'a/b c')).toBe(
      'https://x.cl/cuenta/restablecer/a%2Fb%20c',
    );
  });
});
