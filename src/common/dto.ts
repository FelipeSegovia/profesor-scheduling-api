import type { ChildDto, GuardianDto, SessionDto } from '../bookings/bookings.types.js';
import type { Child, Guardian, Session } from '../generated/prisma/client.js';
import { toWireStatus } from '../domain/session-status.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainError } from './errors/domain-error.js';
import { ErrorMessage } from './errors/messages.js';

/**
 * Mapeos de modelo Prisma → forma del contrato público congelado. Nunca
 * exponen `passwordHash` ni `tokenVersion`. Compartidos entre `bookings/` y
 * `auth/` para no duplicar la forma del `GuardianProfile`.
 */
export function guardianToDto(g: Guardian): GuardianDto {
  return { id: g.id, name: g.name, email: g.email, phone: g.phone };
}

export function childToDto(c: Child): ChildDto {
  return { id: c.id, guardianId: c.guardianId, name: c.name, age: c.age };
}

export function sessionToDto(s: Session): SessionDto {
  return {
    id: s.id,
    childId: s.childId,
    guardianId: s.guardianId,
    startsAt: s.startsAt.toISOString(),
    status: toWireStatus(s.status),
    confirmToken: s.confirmToken,
    cancelToken: s.cancelToken,
    helpRequest: s.helpRequest ?? undefined,
  };
}

export async function buildGuardianProfile(
  prisma: PrismaService,
  guardianId: string,
): Promise<{ guardian: GuardianDto; children: ChildDto[] }> {
  const guardian = await prisma.guardian.findUnique({ where: { id: guardianId } });
  if (!guardian) {
    throw new DomainError(ErrorMessage.NO_ACCOUNT, 404, 'NO_ACCOUNT');
  }
  const children = await prisma.child.findMany({ where: { guardianId } });
  return { guardian: guardianToDto(guardian), children: children.map(childToDto) };
}
