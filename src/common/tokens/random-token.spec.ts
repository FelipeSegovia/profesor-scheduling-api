import { hashToken, randomToken } from './random-token.js';

describe('randomToken', () => {
  it('genera 48 caracteres hexadecimales (24 bytes)', () => {
    const token = randomToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('dos llamadas no colisionan', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('hashToken', () => {
  it('es determinístico', () => {
    const token = randomToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('dos tokens distintos producen hashes distintos', () => {
    expect(hashToken(randomToken())).not.toBe(hashToken(randomToken()));
  });
});
