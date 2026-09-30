import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentGuardian as CurrentGuardianType } from './guardian-context.middleware.js';

/** Lee `request.guardian`, seteado por `GuardianContextMiddleware`. `undefined` si no hay sesión. */
export const CurrentGuardian = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentGuardianType | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.guardian;
  },
);
