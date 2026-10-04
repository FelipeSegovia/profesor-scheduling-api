import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { PanelErrorMessage } from '../../common/errors/panel-messages.js';
import { normalizeEmail } from '../../domain/auth.js';
import { normalizeName } from '../../domain/booking.js';
import type { SessionStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { sessionToPanelDto } from '../panel.dto.js';
import type {
  CreateChildBody,
  CreateGuardianBody,
  UpdateChildBody,
  UpdateGuardianBody,
} from './panel-people.schemas.js';
import type {
  PanelChildDto,
  PanelGuardianDetail,
  PanelGuardianDto,
  PanelGuardianListItem,
} from './panel-people.types.js';

const ACTIVE: SessionStatus[] = ['PENDING', 'CONFIRMED'];

@Injectable()
export class PanelPeopleService {
  constructor(private readonly prisma: PrismaService) {}

  private toGuardianDto(g: { id: string; name: string; email: string; phone: string }): PanelGuardianDto {
    return { id: g.id, name: g.name, email: g.email, phone: g.phone };
  }

  private toChildDto(c: { id: string; guardianId: string; name: string; age: number }): PanelChildDto {
    return { id: c.id, guardianId: c.guardianId, name: c.name, age: c.age };
  }

  async listGuardians(query?: string): Promise<PanelGuardianListItem[]> {
    const guardians = await this.prisma.guardian.findMany({
      where: query
        ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] }
        : undefined,
      include: {
        children: true,
        sessions: { where: { status: { in: ACTIVE } } },
      },
      orderBy: { name: 'asc' },
    });

    return guardians.map((g) => ({
      id: g.id,
      name: g.name,
      email: g.email,
      phone: g.phone,
      childrenCount: g.children.length,
      activeSessions: g.sessions.length,
    }));
  }

  async getGuardian(id: string): Promise<PanelGuardianDetail> {
    const guardian = await this.prisma.guardian.findUnique({ where: { id } });
    if (!guardian) {
      throw new DomainError(PanelErrorMessage.GUARDIAN_NOT_FOUND, 404, 'GUARDIAN_NOT_FOUND');
    }
    const [children, sessions] = await Promise.all([
      this.prisma.child.findMany({
        where: { guardianId: id },
        include: { _count: { select: { notes: true } } },
      }),
      this.prisma.session.findMany({
        where: { guardianId: id },
        include: { child: true, guardian: true },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    return {
      guardian: this.toGuardianDto(guardian),
      children: children.map((c) => ({ ...this.toChildDto(c), notesCount: c._count.notes })),
      sessions: sessions.map(sessionToPanelDto),
    };
  }

  async createGuardian(body: CreateGuardianBody): Promise<PanelGuardianDto> {
    const email = normalizeEmail(body.email);
    const existing = await this.prisma.guardian.findUnique({ where: { email } });
    if (existing) {
      throw new DomainError(PanelErrorMessage.GUARDIAN_EXISTS, 409, 'GUARDIAN_EXISTS');
    }
    const guardian = await this.prisma.guardian.create({
      data: { name: body.name.trim(), email, phone: body.phone.trim() },
    });
    return this.toGuardianDto(guardian);
  }

  async updateGuardian(id: string, body: UpdateGuardianBody): Promise<PanelGuardianDto> {
    const existing = await this.prisma.guardian.findUnique({ where: { id } });
    if (!existing) {
      throw new DomainError(PanelErrorMessage.GUARDIAN_NOT_FOUND, 404, 'GUARDIAN_NOT_FOUND');
    }
    const guardian = await this.prisma.guardian.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
      },
    });
    return this.toGuardianDto(guardian);
  }

  /** Sin rango de edad: la educadora puede guardar una edad fuera de 3-13 (canon, distinto del formulario público). */
  async createChild(guardianId: string, body: CreateChildBody): Promise<PanelChildDto> {
    const guardian = await this.prisma.guardian.findUnique({ where: { id: guardianId } });
    if (!guardian) {
      throw new DomainError(PanelErrorMessage.GUARDIAN_NOT_FOUND, 404, 'GUARDIAN_NOT_FOUND');
    }
    const normalizedName = normalizeName(body.name);
    const existing = await this.prisma.child.findUnique({
      where: { guardianId_normalizedName: { guardianId, normalizedName } },
    });
    if (existing) {
      throw new DomainError(PanelErrorMessage.CHILD_EXISTS, 409, 'CHILD_EXISTS');
    }
    const child = await this.prisma.child.create({
      data: { guardianId, name: body.name.trim(), normalizedName, age: body.age },
    });
    return this.toChildDto(child);
  }

  async updateChild(id: string, body: UpdateChildBody): Promise<PanelChildDto> {
    const existing = await this.prisma.child.findUnique({ where: { id } });
    if (!existing) {
      throw new DomainError(PanelErrorMessage.CHILD_NOT_FOUND, 404, 'CHILD_NOT_FOUND');
    }
    const child = await this.prisma.child.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim(), normalizedName: normalizeName(body.name) } : {}),
        ...(body.age !== undefined ? { age: body.age } : {}),
      },
    });
    return this.toChildDto(child);
  }
}
