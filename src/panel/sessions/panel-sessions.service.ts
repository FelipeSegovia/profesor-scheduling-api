import { Injectable } from '@nestjs/common';
import { canCancelSession, canMarkConfirmed, canMoveSession, initialSessionStatus } from '../../domain/booking.js';
import { expandSeriesDates } from '../../domain/series.js';
import {
  chileDateToColumn,
  columnToChileDate,
  isPastSlot,
  toChileDateString,
  toChileTimeString,
} from '../../domain/time.js';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorMessage } from '../../common/errors/messages.js';
import { PanelErrorMessage } from '../../common/errors/panel-messages.js';
import { isSlotTakenViolation } from '../../common/prisma/prisma-errors.js';
import { randomToken } from '../../common/tokens/random-token.js';
import type { SessionStatus } from '../../generated/prisma/enums.js';
import { SessionEventsService } from '../../events/session-events.service.js';
import { sessionEvent } from '../../events/session-events.js';
import type { SessionEventKind } from '../../events/session-events.types.js';
import { OutboxKind, OutboxService } from '../../outbox/outbox.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { sessionToPanelDto, type PanelSessionDto } from '../panel.dto.js';
import type {
  CreateSeriesBody,
  CreateSessionBody,
  MoveSessionBody,
} from './panel-sessions.schemas.js';
import type { CreateSeriesResult, SkipReason } from './panel-sessions.types.js';

const ACTIVE: SessionStatus[] = ['PENDING', 'CONFIRMED'];

@Injectable()
export class PanelSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly events: SessionEventsService,
  ) {}

  /**
   * Avisa del cambio ya confirmado en la base (se llama después del commit). El
   * actor es siempre la educadora: el panel no muestra aviso por lo que ella
   * hace, pero otras pestañas suyas sí se refrescan.
   */
  private emitEvent(
    kind: SessionEventKind,
    session: { id: string; startsAt: Date; child: { name: string } },
    at: Date,
  ): void {
    this.events.emit(
      sessionEvent({
        kind,
        sessionId: session.id,
        childName: session.child.name,
        startsAt: session.startsAt,
        actor: 'EDUCATOR',
        at,
      }),
    );
  }

  /** 409 SLOT_BLOCKED si el día o el cupo puntual están bloqueados. La educadora puede agendar fuera de plantilla, pero no sobre un bloqueo explícito. */
  private async assertNotBlocked(startsAtIso: string): Promise<void> {
    const date = toChileDateString(new Date(startsAtIso));
    const time = toChileTimeString(new Date(startsAtIso));
    const [dayBlocked, slotBlocked] = await Promise.all([
      this.prisma.dayBlock.findUnique({ where: { date: chileDateToColumn(date) } }),
      this.prisma.slotBlock.findUnique({
        where: { date_time: { date: chileDateToColumn(date), time } },
      }),
    ]);
    if (dayBlocked || slotBlocked) {
      throw new DomainError(PanelErrorMessage.SLOT_BLOCKED, 409, 'SLOT_BLOCKED');
    }
  }

  async createSession(body: CreateSessionBody): Promise<PanelSessionDto> {
    const child = await this.prisma.child.findUnique({ where: { id: body.childId } });
    if (!child) {
      throw new DomainError(PanelErrorMessage.CHILD_NOT_FOUND, 404, 'CHILD_NOT_FOUND');
    }
    if (isPastSlot(body.startsAt)) {
      throw new DomainError(ErrorMessage.PAST_SLOT, 400, 'PAST_SLOT');
    }
    await this.assertNotBlocked(body.startsAt);

    const prefs = await this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
    const status = initialSessionStatus(body.startsAt, prefs.confirmationDeadlineHours);
    const helpRequest = body.helpRequest?.trim() || undefined;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const session = await tx.session.create({
          data: {
            childId: child.id,
            guardianId: child.guardianId,
            startsAt: new Date(body.startsAt),
            status,
            confirmToken: randomToken(),
            cancelToken: randomToken(),
            helpRequest,
            createdBy: 'EDUCATOR',
          },
          include: { child: true, guardian: true },
        });
        await this.outbox.write(
          {
            kind: status === 'CONFIRMED' ? OutboxKind.BOOKING_CONFIRMED : OutboxKind.BOOKING_PENDING,
            recipient: session.guardian.email,
            sessionId: session.id,
          },
          tx,
        );
        return session;
      });
      this.emitEvent('CREATED', created, created.createdAt);
      return sessionToPanelDto(created);
    } catch (err) {
      if (isSlotTakenViolation(err)) {
        throw new DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN');
      }
      throw err;
    }
  }

  async move(id: string, body: MoveSessionBody): Promise<PanelSessionDto> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new DomainError(PanelErrorMessage.SESSION_NOT_FOUND, 404, 'SESSION_NOT_FOUND');
    }
    if (!canMoveSession({ startsAt: session.startsAt.toISOString(), status: session.status })) {
      throw new DomainError(ErrorMessage.CANCEL_NOT_ALLOWED, 409, 'CANCEL_NOT_ALLOWED');
    }
    if (isPastSlot(body.startsAt)) {
      throw new DomainError(ErrorMessage.PAST_SLOT, 400, 'PAST_SLOT');
    }
    await this.assertNotBlocked(body.startsAt);

    const prefs = await this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
    const nextStatus = initialSessionStatus(body.startsAt, prefs.confirmationDeadlineHours);

    const changedAt = new Date();
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.session.update({
          where: { id },
          data: {
            startsAt: new Date(body.startsAt),
            status: nextStatus,
            statusChangedBy: 'EDUCATOR',
            statusChangedAt: changedAt,
          },
          include: { child: true, guardian: true },
        });
        await this.outbox.write(
          { kind: OutboxKind.RESCHEDULED, recipient: u.guardian.email, sessionId: u.id },
          tx,
        );
        return u;
      });
      this.emitEvent('MOVED', updated, changedAt);
      return sessionToPanelDto(updated);
    } catch (err) {
      if (isSlotTakenViolation(err)) {
        throw new DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN');
      }
      throw err;
    }
  }

  async confirm(id: string): Promise<PanelSessionDto> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new DomainError(PanelErrorMessage.SESSION_NOT_FOUND, 404, 'SESSION_NOT_FOUND');
    }
    if (!canMarkConfirmed({ startsAt: session.startsAt.toISOString(), status: session.status })) {
      throw new DomainError(ErrorMessage.NOT_PENDING, 409, 'NOT_PENDING');
    }

    const changedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.session.update({
        where: { id },
        data: { status: 'CONFIRMED', statusChangedBy: 'EDUCATOR', statusChangedAt: changedAt },
        include: { child: true, guardian: true },
      });
      await this.outbox.write(
        { kind: OutboxKind.CONFIRMED, recipient: u.guardian.email, sessionId: u.id },
        tx,
      );
      return u;
    });
    this.emitEvent('CONFIRMED', updated, changedAt);
    return sessionToPanelDto(updated);
  }

  async cancel(id: string): Promise<PanelSessionDto> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new DomainError(PanelErrorMessage.SESSION_NOT_FOUND, 404, 'SESSION_NOT_FOUND');
    }
    if (!canCancelSession({ startsAt: session.startsAt.toISOString(), status: session.status })) {
      throw new DomainError(ErrorMessage.CANCEL_NOT_ALLOWED, 409, 'CANCEL_NOT_ALLOWED');
    }

    const changedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.session.update({
        where: { id },
        data: { status: 'CANCELLED', statusChangedBy: 'EDUCATOR', statusChangedAt: changedAt },
        include: { child: true, guardian: true },
      });
      await this.outbox.write(
        { kind: OutboxKind.CANCELLED, recipient: u.guardian.email, sessionId: u.id },
        tx,
      );
      return u;
    });
    this.emitEvent('CANCELLED', updated, changedAt);
    return sessionToPanelDto(updated);
  }

  async createSeries(body: CreateSeriesBody): Promise<CreateSeriesResult> {
    const child = await this.prisma.child.findUnique({ where: { id: body.childId } });
    if (!child) {
      throw new DomainError(PanelErrorMessage.CHILD_NOT_FOUND, 404, 'CHILD_NOT_FOUND');
    }

    const dates = expandSeriesDates(body);
    if (dates.length === 0) {
      throw new DomainError(PanelErrorMessage.SERIES_EMPTY, 400, 'SERIES_EMPTY');
    }

    const dateColumns = dates.map((d) => chileDateToColumn(d.date));
    const [activeSessions, dayBlocks, slotBlocks, prefs] = await Promise.all([
      this.prisma.session.findMany({
        where: { startsAt: { in: dates.map((d) => new Date(d.startsAt)) }, status: { in: ACTIVE } },
      }),
      this.prisma.dayBlock.findMany({ where: { date: { in: dateColumns } } }),
      this.prisma.slotBlock.findMany({ where: { date: { in: dateColumns }, time: body.time } }),
      this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    const occupied = new Set(activeSessions.map((s) => s.startsAt.toISOString()));
    const blockedDays = new Set(dayBlocks.map((b) => columnToChileDate(b.date)));
    const blockedSlotDays = new Set(slotBlocks.map((b) => columnToChileDate(b.date)));

    const toCreate: typeof dates = [];
    const skipped: { date: string; reason: SkipReason }[] = [];
    for (const d of dates) {
      if (isPastSlot(d.startsAt)) {
        skipped.push({ date: d.date, reason: 'PAST' });
      } else if (occupied.has(d.startsAt)) {
        skipped.push({ date: d.date, reason: 'OCCUPIED' });
      } else if (blockedDays.has(d.date)) {
        skipped.push({ date: d.date, reason: 'DAY_BLOCKED' });
      } else if (blockedSlotDays.has(d.date)) {
        skipped.push({ date: d.date, reason: 'SLOT_BLOCKED' });
      } else {
        toCreate.push(d);
      }
    }

    if (toCreate.length === 0) {
      throw new DomainError(PanelErrorMessage.SERIES_EMPTY, 400, 'SERIES_EMPTY');
    }

    const now = Date.now();
    const noticeWindowMs = prefs.seriesNoticeHours * 3_600_000;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const series = await tx.series.create({
          data: {
            childId: child.id,
            guardianId: child.guardianId,
            weekday: body.weekday,
            time: body.time,
            startDate: chileDateToColumn(body.startDate),
            endDate: chileDateToColumn(body.endDate),
          },
        });

        await tx.session.createMany({
          data: toCreate.map((d) => ({
            childId: child.id,
            guardianId: child.guardianId,
            seriesId: series.id,
            startsAt: new Date(d.startsAt),
            status: initialSessionStatus(d.startsAt, prefs.confirmationDeadlineHours),
            confirmToken: randomToken(),
            cancelToken: randomToken(),
            createdBy: 'EDUCATOR',
          })),
        });

        const created = await tx.session.findMany({
          where: { seriesId: series.id },
          include: { child: true, guardian: true },
          orderBy: { startsAt: 'asc' },
        });

        for (const session of created) {
          if (session.startsAt.getTime() - now <= noticeWindowMs) {
            await this.outbox.write(
              {
                kind:
                  session.status === 'CONFIRMED' ? OutboxKind.BOOKING_CONFIRMED : OutboxKind.BOOKING_PENDING,
                recipient: session.guardian.email,
                sessionId: session.id,
              },
              tx,
            );
          }
        }

        return { series, created };
      });

      for (const session of result.created) {
        this.emitEvent('CREATED', session, session.createdAt);
      }

      return {
        seriesId: result.series.id,
        created: result.created.map(sessionToPanelDto),
        skipped,
      };
    } catch (err) {
      if (isSlotTakenViolation(err)) {
        throw new DomainError(ErrorMessage.SLOT_TAKEN, 409, 'SLOT_TAKEN');
      }
      throw err;
    }
  }
}
