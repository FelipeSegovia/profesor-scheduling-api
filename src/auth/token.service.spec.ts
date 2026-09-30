import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service.js';

function buildService(overrides: Partial<{ secret: string; expiresIn: string }> = {}) {
  const jwt = new JwtService({
    secret: overrides.secret ?? 'a'.repeat(32),
    signOptions: { expiresIn: overrides.expiresIn ?? '1h' },
  });
  return new TokenService(jwt);
}

describe('TokenService', () => {
  it('firma y verifica un token válido, devolviendo sub y tokenVersion', async () => {
    const service = buildService();
    const token = await service.sign({ id: 'guard_1', tokenVersion: 2 });
    const payload = await service.verify(token);
    expect(payload).toMatchObject({ sub: 'guard_1', tokenVersion: 2 });
  });

  it('devuelve null (nunca lanza) para un token firmado con otro secreto', async () => {
    const signer = buildService({ secret: 'b'.repeat(32) });
    const verifier = buildService({ secret: 'a'.repeat(32) });
    const token = await signer.sign({ id: 'guard_1', tokenVersion: 0 });
    expect(await verifier.verify(token)).toBeNull();
  });

  it('devuelve null (nunca lanza) para un token vencido', async () => {
    const service = buildService({ expiresIn: '1ms' });
    const token = await service.sign({ id: 'guard_1', tokenVersion: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await service.verify(token)).toBeNull();
  });

  it('devuelve null para basura que no es un JWT', async () => {
    const service = buildService();
    expect(await service.verify('no-soy-un-token')).toBeNull();
  });
});
