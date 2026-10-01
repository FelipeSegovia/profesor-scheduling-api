import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentEducator as CurrentEducatorType } from './educator-context.middleware.js';

/** Lee `request.educator`, seteado por `EducatorContextMiddleware`. `undefined` si no hay sesión. */
export const CurrentEducator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentEducatorType | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.educator;
  },
);
