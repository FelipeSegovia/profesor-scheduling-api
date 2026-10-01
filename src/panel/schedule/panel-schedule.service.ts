import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error.js';
import { PanelErrorMessage } from '../../common/errors/panel-messages.js';
import { validatePreferences } from '../../domain/preferences.js';
import { templateRowsFromWorkWeek, workWeekFromTemplateRows } from '../../domain/schedule.js';
import {
  chileDateToColumn,
  chileDayRange,
  slotStartsAtIso,
  toChileDateString,
  toChileTimeString,
  weekdayOf,
} from '../../domain/time.js';
import type { SessionStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BlockDayBody, BlockSlotBody, UpdatePreferencesBody, UpdateTemplateBody } from './panel-schedule.schemas.js';
import type { PanelPreferencesResponse, UpdateTemplateResult } from './panel-schedule.types.js';

const ACTIVE: SessionStatus[] = ['PENDING', 'CONFIRMED'];

@Injectable()
export class PanelScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(): Promise<PanelPreferencesResponse> {
    const [rows, prefs] = await Promise.all([
      this.prisma.templateSlot.findMany(),
      this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } }),
    ]);

    return {
      workWeek: workWeekFromTemplateRows(rows),
      confirmationDeadlineHours: prefs.confirmationDeadlineHours,
      seriesNoticeHours: prefs.seriesNoticeHours,
      bookingHorizonWeeks: prefs.bookingHorizonWeeks,
    };
  }

  async updatePreferences(body: UpdatePreferencesBody): Promise<PanelPreferencesResponse> {
    const issue = validatePreferences(body);
    if (issue) {
      throw new DomainError(PanelErrorMessage[issue], 400, issue);
    }

    await this.prisma.preferences.update({ where: { id: 1 }, data: body });
    return this.getPreferences();
  }

  async replaceTemplate(body: UpdateTemplateBody): Promise<UpdateTemplateResult> {
    const rows = templateRowsFromWorkWeek(body.workWeek);
    const current = await this.prisma.templateSlot.findMany();

    const toDelete = current.filter(
      (c) => !rows.some((r) => r.weekday === c.weekday && r.time === c.time),
    );
    const toCreate = rows.filter(
      (r) => !current.some((c) => c.weekday === r.weekday && c.time === r.time),
    );

    await this.prisma.$transaction([
      this.prisma.templateSlot.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } }),
      this.prisma.templateSlot.createMany({ data: toCreate }),
    ]);

    const future = await this.prisma.session.findMany({
      where: { startsAt: { gt: new Date() }, status: { in: ACTIVE } },
    });
    const orphanSessions = future.filter((s) => {
      const weekday = weekdayOf(toChileDateString(s.startsAt));
      const time = toChileTimeString(s.startsAt);
      return !rows.some((r) => r.weekday === weekday && r.time === time);
    }).length;

    const preferences = await this.getPreferences();
    return { workWeek: preferences.workWeek, orphanSessions };
  }

  async blockDay(body: BlockDayBody): Promise<void> {
    await this.assertDayEmpty(body.date);
    await this.prisma.dayBlock.upsert({
      where: { date: chileDateToColumn(body.date) },
      create: { date: chileDateToColumn(body.date) },
      update: {},
    });
  }

  async unblockDay(date: string): Promise<void> {
    await this.prisma.dayBlock.deleteMany({ where: { date: chileDateToColumn(date) } });
  }

  async blockSlot(body: BlockSlotBody): Promise<void> {
    await this.assertSlotEmpty(body.date, body.time);
    await this.prisma.slotBlock.upsert({
      where: { date_time: { date: chileDateToColumn(body.date), time: body.time } },
      create: { date: chileDateToColumn(body.date), time: body.time },
      update: {},
    });
  }

  async unblockSlot(date: string, time: string): Promise<void> {
    await this.prisma.slotBlock.deleteMany({ where: { date: chileDateToColumn(date), time } });
  }

  /** Solo se bloquea un cupo vacío: si hay una sesión activa ese día, primero se cancela o se mueve. */
  private async assertDayEmpty(dateYmd: string): Promise<void> {
    const [start, end] = chileDayRange(dateYmd);
    const activeSession = await this.prisma.session.findFirst({
      where: { startsAt: { gte: start, lt: end }, status: { in: ACTIVE } },
    });
    if (activeSession) {
      throw new DomainError(PanelErrorMessage.SLOT_NOT_EMPTY, 409, 'SLOT_NOT_EMPTY');
    }
  }

  private async assertSlotEmpty(dateYmd: string, time: string): Promise<void> {
    const activeSession = await this.prisma.session.findFirst({
      where: { startsAt: new Date(slotStartsAtIso(dateYmd, time)), status: { in: ACTIVE } },
    });
    if (activeSession) {
      throw new DomainError(PanelErrorMessage.SLOT_NOT_EMPTY, 409, 'SLOT_NOT_EMPTY');
    }
  }
}
