import { Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorMessage } from '../../common/errors/messages.js';
import { normalizeEmail, PASSWORD_MIN_LENGTH } from '../../domain/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EducatorTokenService } from './educator-token.service.js';
import type { PanelLoginBody, PanelPasswordBody } from './panel-auth.schemas.js';
import type { EducatorProfile, PanelAuthResult } from './panel-auth.types.js';

/**
 * Login y cambio de clave de la educadora. Calcado de `AuthService` (spec
 * 003) pero contra `Educator`: usuaria única, sin flujo de "olvidé mi clave"
 * (recuperación operativa vía `pnpm db:seed` con una clave nueva — ver
 * `.specs/004-panel-educadora/spec.md`).
 */
@Injectable()
export class PanelAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: EducatorTokenService,
  ) {}

  private assertPassword(password: string): void {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new DomainError(ErrorMessage.weakPassword(PASSWORD_MIN_LENGTH), 400, 'WEAK_PASSWORD');
    }
  }

  private toProfile(educator: { id: string; name: string; email: string }): EducatorProfile {
    return { id: educator.id, name: educator.name, email: educator.email };
  }

  async login(body: PanelLoginBody): Promise<PanelAuthResult> {
    const email = normalizeEmail(body.email);
    if (!email || !body.password.trim()) {
      throw new DomainError(ErrorMessage.MISSING_FIELDS, 400, 'MISSING_FIELDS');
    }

    const invalid = () => new DomainError(ErrorMessage.INVALID_CREDENTIALS, 401, 'INVALID_CREDENTIALS');
    const educator = await this.prisma.educator.findUnique({ where: { email } });
    if (!educator) throw invalid();
    if (!(await verify(educator.passwordHash, body.password))) throw invalid();

    return {
      token: await this.tokens.sign(educator),
      educator: this.toProfile(educator),
    };
  }

  async me(educatorId: string): Promise<{ educator: EducatorProfile }> {
    const educator = await this.prisma.educator.findUniqueOrThrow({ where: { id: educatorId } });
    return { educator: this.toProfile(educator) };
  }

  async changePassword(educatorId: string, body: PanelPasswordBody): Promise<{ token: string }> {
    const educator = await this.prisma.educator.findUniqueOrThrow({ where: { id: educatorId } });
    if (!(await verify(educator.passwordHash, body.currentPassword))) {
      throw new DomainError(ErrorMessage.INVALID_CREDENTIALS, 401, 'INVALID_CREDENTIALS');
    }
    this.assertPassword(body.newPassword);

    const passwordHash = await hash(body.newPassword);
    const updated = await this.prisma.educator.update({
      where: { id: educatorId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    return { token: await this.tokens.sign(updated) };
  }
}
