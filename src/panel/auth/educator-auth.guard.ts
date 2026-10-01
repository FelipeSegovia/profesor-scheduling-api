import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorMessage } from '../../common/errors/messages.js';

/**
 * Exige que `EducatorContextMiddleware` haya seteado `request.educator`. Se
 * aplica con `@UseGuards(EducatorAuthGuard)` a nivel de clase en cada
 * controlador del panel (todas sus rutas requieren sesión), y por método en
 * `panel-auth.controller.ts` para excluir `login`. Deliberadamente NO se usa
 * `APP_GUARD`: ese token aplica el guard a nivel de toda la aplicación,
 * incluidas las rutas del apoderado — exactamente la fuga de privilegios que
 * esta spec busca evitar. Ver `.specs/004-panel-educadora/plan.md`.
 */
@Injectable()
export class EducatorAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.educator) {
      throw new DomainError(ErrorMessage.NO_SESSION, 401, 'NO_SESSION');
    }
    return true;
  }
}
