import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  NODE_ENV: 'development',
  JWT_SECRET: 'x'.repeat(32),
  EDUCATOR_JWT_SECRET: 'y'.repeat(32),
  PUBLIC_WEB_URL: 'http://localhost:5173',
};

describe('validateEnv — correo (spec 006)', () => {
  it('sin variables de correo arranca, con el intervalo por defecto', () => {
    const env = validateEnv(base);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(15000);
  });

  it('una variable vacía cuenta como no configurada', () => {
    const env = validateEnv({
      ...base,
      RESEND_API_KEY: '',
      EMAIL_REPLY_TO: '',
      EMAIL_REDIRECT_TO: '',
    });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_REPLY_TO).toBeUndefined();
    expect(env.EMAIL_REDIRECT_TO).toBeUndefined();
  });

  it('acepta la configuración completa de sandbox', () => {
    const env = validateEnv({
      ...base,
      RESEND_API_KEY: 're_123',
      EMAIL_FROM: 'onboarding@resend.dev',
      EMAIL_REPLY_TO: 'educadora@example.com',
      EMAIL_REDIRECT_TO: 'yo@example.com',
      OUTBOX_POLL_INTERVAL_MS: '5000',
    });
    expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(5000);
  });

  it('RESEND_API_KEY sin EMAIL_FROM no arranca', () => {
    expect(() => validateEnv({ ...base, RESEND_API_KEY: 're_123' })).toThrow(
      /EMAIL_FROM/,
    );
  });

  it('producción sin RESEND_API_KEY no arranca', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /RESEND_API_KEY/,
    );
  });

  it('producción con EMAIL_REDIRECT_TO no arranca', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_123',
        EMAIL_FROM: 'Loreto Castillo <agenda@example.com>',
        EMAIL_REDIRECT_TO: 'yo@example.com',
      }),
    ).toThrow(/EMAIL_REDIRECT_TO/);
  });

  describe('PUBLIC_WEB_URL en producción', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_123',
      EMAIL_FROM: 'Loreto Castillo <agenda@example.com>',
    };

    it.each([
      'http://localhost:5173',
      'https://localhost:5173',
      'http://127.0.0.1:5173',
      'http://0.0.0.0:5173',
      'http://[::1]:5173',
      'https://agenda.localhost',
    ])('%s no arranca', (url) => {
      expect(() => validateEnv({ ...production, PUBLIC_WEB_URL: url })).toThrow(
        /PUBLIC_WEB_URL: no puede apuntar a localhost/,
      );
    });

    it('sin https no arranca', () => {
      expect(() =>
        validateEnv({ ...production, PUBLIC_WEB_URL: 'http://agenda.example.cl' }),
      ).toThrow(/PUBLIC_WEB_URL: debe usar https/);
    });

    it('acepta la URL pública con https, también con subruta', () => {
      expect(
        validateEnv({ ...production, PUBLIC_WEB_URL: 'https://agenda.example.cl' }).PUBLIC_WEB_URL,
      ).toBe('https://agenda.example.cl');
      expect(() =>
        validateEnv({ ...production, PUBLIC_WEB_URL: 'https://example.cl/agenda/' }),
      ).not.toThrow();
    });

    it('fuera de producción localhost sigue valiendo', () => {
      expect(validateEnv(base).PUBLIC_WEB_URL).toBe('http://localhost:5173');
    });
  });

  it('rechaza un correo inválido y un intervalo menor a 1000 ms', () => {
    expect(() =>
      validateEnv({ ...base, EMAIL_REPLY_TO: 'no-es-correo' }),
    ).toThrow(/EMAIL_REPLY_TO/);
    expect(() =>
      validateEnv({ ...base, OUTBOX_POLL_INTERVAL_MS: '500' }),
    ).toThrow(/OUTBOX_POLL_INTERVAL_MS/);
  });
});
