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

  it('rechaza un correo inválido y un intervalo menor a 1000 ms', () => {
    expect(() =>
      validateEnv({ ...base, EMAIL_REPLY_TO: 'no-es-correo' }),
    ).toThrow(/EMAIL_REPLY_TO/);
    expect(() =>
      validateEnv({ ...base, OUTBOX_POLL_INTERVAL_MS: '500' }),
    ).toThrow(/OUTBOX_POLL_INTERVAL_MS/);
  });
});
