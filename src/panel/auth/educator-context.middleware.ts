import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EducatorTokenService } from './educator-token.service.js';

export interface CurrentEducator {
  id: string;
  email: string;
  name: string;
  tokenVersion: number;
}

declare module 'express' {
  interface Request {
    educator?: CurrentEducator;
  }
}

/**
 * Decodifica un `Authorization: Bearer <token>` de la educadora y, si es
 * válido (firma, vencimiento, `role:'educator'` y `tokenVersion` vigentes),
 * deja `request.educator` seteado. Nunca lanza, igual que
 * `GuardianContextMiddleware` — la diferencia es que en el panel el Bearer es
 * obligatorio en la práctica: `EducatorAuthGuard` exige sesión en todas las
 * rutas salvo el login. Ver `.specs/004-panel-educadora/plan.md`.
 */
@Injectable()
export class EducatorContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(EducatorContextMiddleware.name);

  constructor(
    private readonly tokens: EducatorTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = header.slice('Bearer '.length);
    const payload = await this.tokens.verify(token);
    if (!payload) {
      this.logger.debug('Bearer de educadora inválido o vencido.');
      next();
      return;
    }

    const educator = await this.prisma.educator.findUnique({ where: { id: payload.sub } });
    if (!educator || educator.tokenVersion !== payload.tokenVersion) {
      this.logger.debug('Educator inexistente o tokenVersion desactualizado.');
      next();
      return;
    }

    req.educator = {
      id: educator.id,
      email: educator.email,
      name: educator.name,
      tokenVersion: educator.tokenVersion,
    };
    next();
  }
}
