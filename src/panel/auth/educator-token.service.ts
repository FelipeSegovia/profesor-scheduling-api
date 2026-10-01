import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface EducatorTokenPayload {
  sub: string;
  tokenVersion: number;
  role: 'educator';
}

/**
 * Firma y verifica el JWT de la educadora. Secreto y `JwtModule` propios
 * (registrados en `PanelModule`, no en `AuthModule`): un token de esta
 * superficie nunca debe decodificar contra el secreto del apoderado ni
 * viceversa. El claim `role: 'educator'` es una defensa adicional para que los
 * logs distingan "token de otra superficie" de "token corrupto" — la
 * separación real la da el secreto distinto. Ver
 * `.specs/004-panel-educadora/plan.md`, sección "Autenticación de la educadora".
 */
@Injectable()
export class EducatorTokenService {
  constructor(private readonly jwt: JwtService) {}

  async sign(educator: { id: string; tokenVersion: number }): Promise<string> {
    return this.jwt.signAsync({ sub: educator.id, tokenVersion: educator.tokenVersion, role: 'educator' });
  }

  /** Nunca lanza: devuelve `null` ante cualquier token ausente, corrupto o de otro rol. */
  async verify(token: string): Promise<EducatorTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<EducatorTokenPayload>(token);
      return payload.role === 'educator' ? payload : null;
    } catch {
      return null;
    }
  }
}
