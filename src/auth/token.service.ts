import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface GuardianTokenPayload {
  sub: string;
  tokenVersion: number;
}

/**
 * Firma y verifica el JWT del apoderado. El payload solo lleva `sub`
 * (guardianId) y `tokenVersion` — nunca el email, para que no quede
 * desactualizado si el apoderado lo cambia. Ver
 * `.specs/003-reserva-publica/plan.md`, sección "Autenticación del apoderado".
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  async sign(guardian: { id: string; tokenVersion: number }): Promise<string> {
    return this.jwt.signAsync({ sub: guardian.id, tokenVersion: guardian.tokenVersion });
  }

  /** Nunca lanza: devuelve `null` ante cualquier token ausente o inválido. */
  async verify(token: string): Promise<GuardianTokenPayload | null> {
    try {
      return await this.jwt.verifyAsync<GuardianTokenPayload>(token);
    } catch {
      return null;
    }
  }
}
