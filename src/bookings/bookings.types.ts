import type { WireSessionStatus } from '../domain/session-status.js';

/**
 * Formas exactas del contrato público congelado
 * (`public-parents-scheduling-web/src/domain/types.ts`). Nunca incluyen
 * `passwordHash` ni `tokenVersion`: son lo que ve el apoderado, no el modelo
 * de datos interno.
 */
export interface GuardianDto {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface ChildDto {
  id: string;
  guardianId: string;
  name: string;
  age: number;
}

export interface SessionDto {
  id: string;
  childId: string;
  guardianId: string;
  startsAt: string;
  status: WireSessionStatus;
  confirmToken: string;
  cancelToken: string;
  helpRequest?: string;
}

export interface AuthBundle {
  token: string;
  profile: { guardian: GuardianDto; children: ChildDto[] };
}

export interface BookingResult {
  session: SessionDto;
  guardian: GuardianDto;
  child: ChildDto;
  auth?: AuthBundle;
}

export interface CreateBookingInput {
  startsAt: string;
  guardianName: string;
  email: string;
  phone: string;
  childName: string;
  childAge: number;
  helpRequest?: string;
  createAccount?: { password: string };
}
