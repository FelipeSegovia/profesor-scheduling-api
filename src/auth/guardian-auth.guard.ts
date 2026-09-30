import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DomainError } from '../common/errors/domain-error.js';
import { ErrorMessage } from '../common/errors/messages.js';

/**
 * Exige que `GuardianContextMiddleware` haya seteado `request.guardian`.
 * Usado solo en `GET /me`: es la única ruta que requiere sesión (el `Bearer`
 * es opcional en el resto). Ver `.specs/003-reserva-publica/plan.md`.
 */
@Injectable()
export class GuardianAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.guardian) {
      throw new DomainError(ErrorMessage.NO_SESSION, 401, 'NO_SESSION');
    }
    return true;
  }
}
