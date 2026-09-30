import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from 'argon2';
import { buildGuardianProfile } from '../common/dto.js';
import { DomainError } from '../common/errors/domain-error.js';
import { ErrorMessage } from '../common/errors/messages.js';
import { hashToken, randomToken } from '../common/tokens/random-token.js';
import { normalizeEmail, PASSWORD_MIN_LENGTH } from '../domain/auth.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ForgotBody, LoginBody, RegisterBody, ResetBody } from './auth.schemas.js';
import type { AuthResult } from './auth.types.js';
import { TokenService } from './token.service.js';

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Reproduce `public-parents-scheduling-web/src/mocks/db.ts` (`register`,
 * `login`, `requestPasswordReset`, `resetPassword`, `emailHasAccount`). Ver
 * `.specs/003-reserva-publica/spec.md`, sección 5.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private assertPassword(password: string): void {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new DomainError(ErrorMessage.weakPassword(PASSWORD_MIN_LENGTH), 400, 'WEAK_PASSWORD');
    }
  }

  private async authResultFor(guardianId: string): Promise<AuthResult> {
    return {
      token: await this.tokens.sign(await this.prisma.guardian.findUniqueOrThrow({ where: { id: guardianId } })),
      profile: await buildGuardianProfile(this.prisma, guardianId),
    };
  }

  async emailHasAccount(email: string): Promise<boolean> {
    const guardian = await this.prisma.guardian.findUnique({ where: { email: normalizeEmail(email) } });
    return Boolean(guardian?.passwordHash);
  }

  async register(body: RegisterBody): Promise<AuthResult> {
    // Orden exacto del contrato: clave débil se valida antes que campos faltantes.
    this.assertPassword(body.password);

    const email = normalizeEmail(body.email);
    if (!email || !body.guardianName.trim() || !body.phone.trim()) {
      throw new DomainError(ErrorMessage.MISSING_FIELDS, 400, 'MISSING_FIELDS');
    }

    const existing = await this.prisma.guardian.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      throw new DomainError(ErrorMessage.ACCOUNT_EXISTS, 409, 'ACCOUNT_EXISTS');
    }

    const passwordHash = await hash(body.password);
    const guardian = existing
      ? await this.prisma.guardian.update({ where: { id: existing.id }, data: { passwordHash } })
      : await this.prisma.guardian.create({
          data: {
            name: body.guardianName.trim(),
            email,
            phone: body.phone.trim(),
            passwordHash,
          },
        });

    return this.authResultFor(guardian.id);
  }

  async login(body: LoginBody): Promise<AuthResult> {
    const invalid = () => new DomainError(ErrorMessage.INVALID_CREDENTIALS, 401, 'INVALID_CREDENTIALS');
    const guardian = await this.prisma.guardian.findUnique({
      where: { email: normalizeEmail(body.email) },
    });
    if (!guardian?.passwordHash) throw invalid();
    if (!(await verify(guardian.passwordHash, body.password))) throw invalid();
    return this.authResultFor(guardian.id);
  }

  async forgot(body: ForgotBody): Promise<{ ok: true; devResetToken?: string }> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { email: normalizeEmail(body.email) },
    });
    if (!guardian?.passwordHash) {
      // Nunca revela si el email tiene cuenta.
      return { ok: true };
    }

    const plainToken = randomToken();
    await this.prisma.passwordReset.create({
      data: {
        guardianId: guardian.id,
        tokenHash: hashToken(plainToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return isProduction ? { ok: true } : { ok: true, devResetToken: plainToken };
  }

  async reset(body: ResetBody): Promise<AuthResult> {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(body.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new DomainError(ErrorMessage.INVALID_RESET, 400, 'INVALID_RESET');
    }

    this.assertPassword(body.password);

    const guardian = await this.prisma.guardian.findUnique({ where: { id: reset.guardianId } });
    if (!guardian?.passwordHash) {
      throw new DomainError(ErrorMessage.NO_ACCOUNT, 404, 'NO_ACCOUNT');
    }

    const passwordHash = await hash(body.password);
    await this.prisma.$transaction([
      this.prisma.guardian.update({
        where: { id: guardian.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.passwordReset.updateMany({
        where: { guardianId: guardian.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return this.authResultFor(guardian.id);
  }
}
