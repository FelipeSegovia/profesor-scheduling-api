import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error.js';
import { GuardianAuthGuard } from './guardian-auth.guard.js';

function contextWith(guardian: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ guardian }) }),
  } as unknown as ExecutionContext;
}

describe('GuardianAuthGuard', () => {
  const guard = new GuardianAuthGuard();

  it('permite el paso cuando request.guardian está seteado', () => {
    expect(guard.canActivate(contextWith({ id: 'g1', email: 'a@b.cl', tokenVersion: 0 }))).toBe(
      true,
    );
  });

  it('lanza NO_SESSION cuando no hay guardian en la request', () => {
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
