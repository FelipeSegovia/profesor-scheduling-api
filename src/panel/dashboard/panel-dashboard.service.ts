import { Injectable } from '@nestjs/common';
import { chileDayRange, weekMondayYmd, weekSundayYmd } from '../../domain/time.js';
import type { SessionStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SlotsService } from '../../slots/slots.service.js';
import { loadRecentActivity } from '../activity.query.js';
import { sessionToPanelDto } from '../panel.dto.js';
import type { PanelStats, PanelSummaryResponse } from './panel-dashboard.types.js';

const ACTIVE: SessionStatus[] = ['PENDING', 'CONFIRMED'];
const ACTIVITY_LIMIT = 15;

@Injectable()
export class PanelDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
  ) {}

  async getSummary(dateYmd: string): Promise<PanelSummaryResponse> {
    const now = new Date();
    const [dayStart, dayEnd] = chileDayRange(dateYmd);
    const weekStart = weekMondayYmd(new Date(`${dateYmd}T12:00:00`));
    const [, weekEnd] = chileDayRange(weekSundayYmd(weekStart));

    const [educator, stats, todaySessionRows, attentionRows, activity, grid] =
      await Promise.all([
        this.prisma.educator.findFirstOrThrow(),
        this.computeStats(now, dayStart, dayEnd, weekEnd),
        this.prisma.session.findMany({
          where: { startsAt: { gte: dayStart, lt: dayEnd }, status: { in: ACTIVE } },
          include: { child: true, guardian: true },
          orderBy: { startsAt: 'asc' },
        }),
        this.getAttention(now),
        loadRecentActivity(this.prisma, ACTIVITY_LIMIT),
        this.slots.buildWeekGrid(weekStart),
      ]);

    const nextFreeSlot =
      grid
        .filter((c) => c.state === 'FREE' && !c.past)
        .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1))[0] ?? null;

    return {
      today: dateYmd,
      weekStart,
      educator: { id: educator.id, name: educator.name, email: educator.email },
      stats,
      todaySessions: todaySessionRows.map(sessionToPanelDto),
      attention: attentionRows.map(sessionToPanelDto),
      activity,
      nextFreeSlot,
    };
  }

  private async computeStats(
    now: Date,
    dayStart: Date,
    dayEnd: Date,
    weekEnd: Date,
  ): Promise<PanelStats> {
    const [today, confirmed, pending, familiesGroup] = await Promise.all([
      this.prisma.session.count({
        where: { startsAt: { gte: dayStart, lt: dayEnd }, status: { in: ACTIVE } },
      }),
      this.prisma.session.count({
        where: { startsAt: { gte: now, lt: weekEnd }, status: 'CONFIRMED' },
      }),
      this.prisma.session.count({
        where: { startsAt: { gt: now }, status: 'PENDING' },
      }),
      this.prisma.session.groupBy({
        by: ['guardianId'],
        where: { startsAt: { gt: now }, status: { in: ACTIVE } },
      }),
    ]);

    return { today, confirmed, pending, families: familiesGroup.length };
  }

  private async getAttention(now: Date) {
    const prefs = await this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } });
    const deadline = new Date(now.getTime() + prefs.confirmationDeadlineHours * 3_600_000);
    return this.prisma.session.findMany({
      where: { status: 'PENDING', startsAt: { gt: now, lte: deadline } },
      include: { child: true, guardian: true },
      orderBy: { startsAt: 'asc' },
    });
  }
}
