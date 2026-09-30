import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenService } from './token.service.js';

export interface CurrentGuardian {
  id: string;
  email: string;
  tokenVersion: number;
}

declare module 'express' {
  interface Request {
    guardian?: CurrentGuardian;
  }
}

/**
 * Decodifica un `Authorization: Bearer <token>` opcional y, si es válido
 * (firma, vencimiento y `tokenVersion` vigentes), deja `request.guardian`
 * seteado. Nunca lanza: un token ausente, malformado, vencido o con
 * `tokenVersion` desactualizado deja `request.guardian` sin definir, igual que
 * "no hay sesión" — el contrato congelado no distingue ambos casos. Ver
 * `.specs/003-reserva-publica/plan.md`.
 */
@Injectable()
export class GuardianContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GuardianContextMiddleware.name);

  constructor(
    private readonly tokens: TokenService,
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
      this.logger.debug('Bearer inválido o vencido.');
      next();
      return;
    }

    const guardian = await this.prisma.guardian.findUnique({ where: { id: payload.sub } });
    if (!guardian || guardian.tokenVersion !== payload.tokenVersion) {
      this.logger.debug('Guardian inexistente o tokenVersion desactualizado.');
      next();
      return;
    }

    req.guardian = { id: guardian.id, email: guardian.email, tokenVersion: guardian.tokenVersion };
    next();
  }
}
