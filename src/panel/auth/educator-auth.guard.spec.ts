import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { EducatorAuthGuard } from './educator-auth.guard.js';

function contextWith(educator: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ educator }) }),
  } as unknown as ExecutionContext;
}

describe('EducatorAuthGuard', () => {
  const guard = new EducatorAuthGuard();

  it('permite el paso cuando request.educator está seteado', () => {
    expect(
      guard.canActivate(contextWith({ id: 'e1', email: 'a@b.cl', name: 'Loreto', tokenVersion: 0 })),
    ).toBe(true);
  });

  it('lanza NO_SESSION cuando no hay educator en la request', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(DomainError);
    try {
      guard.canActivate(contextWith(undefined));
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('NO_SESSION');
      expect((err as DomainError).status).toBe(401);
    }
  });
});
