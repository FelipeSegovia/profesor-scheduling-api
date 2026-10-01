import { JwtService } from '@nestjs/jwt';
import { EducatorTokenService } from './educator-token.service.js';

function buildService(overrides: Partial<{ secret: string; expiresIn: string }> = {}) {
  const jwt = new JwtService({
    secret: overrides.secret ?? 'a'.repeat(32),
    signOptions: { expiresIn: overrides.expiresIn ?? '1h' },
  });
  return new EducatorTokenService(jwt);
}

describe('EducatorTokenService', () => {
  it('firma y verifica un token válido, con role:educator', async () => {
    const service = buildService();
    const token = await service.sign({ id: 'educator_1', tokenVersion: 0 });
    const payload = await service.verify(token);
    expect(payload).toMatchObject({ sub: 'educator_1', tokenVersion: 0, role: 'educator' });
  });

  it('devuelve null para un token firmado con otro secreto (p. ej. el del apoderado)', async () => {
    const signer = buildService({ secret: 'b'.repeat(32) });
    const verifier = buildService({ secret: 'a'.repeat(32) });
    const token = await signer.sign({ id: 'educator_1', tokenVersion: 0 });
    expect(await verifier.verify(token)).toBeNull();
  });

  it('devuelve null para un token vencido', async () => {
    const service = buildService({ expiresIn: '1ms' });
    const token = await service.sign({ id: 'educator_1', tokenVersion: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await service.verify(token)).toBeNull();
  });

  it('devuelve null para un payload sin role:educator (token de otra superficie)', async () => {
    const jwt = new JwtService({ secret: 'a'.repeat(32) });
    const service = new EducatorTokenService(jwt);
    const guardianLikeToken = await jwt.signAsync({ sub: 'guardian_1', tokenVersion: 0 });
    expect(await service.verify(guardianLikeToken)).toBeNull();
  });

  it('devuelve null para basura que no es un JWT', async () => {
    const service = buildService();
    expect(await service.verify('no-soy-un-token')).toBeNull();
  });
});
