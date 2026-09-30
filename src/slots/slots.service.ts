import { Injectable } from '@nestjs/common';
import { addDays, format } from 'date-fns';
import { isSlotOccupied } from '../domain/booking.js';
import {
  chileDateToColumn,
  columnToChileDate,
  isPastSlot,
  slotStartsAtIso,
  weekDaysMonSatYmd,
  weekMondayYmd,
  weekdayOf,
} from '../domain/time.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SlotView } from './slots.types.js';

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cupos de lunes a sábado para la semana que empieza en `mondayYmd`. Ver
   * `.specs/003-reserva-publica/plan.md`, sección "Cálculo de cupos".
   */
  async buildWeekSlots(mondayYmd: string): Promise<SlotView[]> {
    const days = weekDaysMonSatYmd(mondayYmd);
    const dayColumns = days.map(chileDateToColumn);

    const [dayBlocks, templates, slotBlocks, prefs] = await Promise.all([
      this.prisma.dayBlock.findMany({ where: { date: { in: dayColumns } } }),
      this.prisma.templateSlot.findMany(),
      this.prisma.slotBlock.findMany({ where: { date: { in: dayColumns } } }),
      this.prisma.preferences.findUniqueOrThrow({ where: { id: 1 } }),
    ]);

    const blockedDays = new Set(dayBlocks.map((b) => columnToChileDate(b.date)));
    const blockedSlots = new Set(
      slotBlocks.map((b) => `${columnToChileDate(b.date)}T${b.time}`),
    );

    const candidates = days.flatMap((date) => {
      const weekday = weekdayOf(date);
      return templates
        .filter((t) => t.weekday === weekday)
        .map((t) => ({ date, time: t.time }));
    });

    const startsAtByCandidate = candidates.map((c) => slotStartsAtIso(c.date, c.time));
    const sessions =
      startsAtByCandidate.length === 0
        ? []
        : await this.prisma.session.findMany({
            where: { startsAt: { in: startsAtByCandidate.map((iso) => new Date(iso)) } },
            select: { startsAt: true, status: true },
          });
    const sessionsForDomain = sessions.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      status: s.status,
    }));

    const horizonLimitYmd = format(
      addDays(new Date(`${weekMondayYmd()}T12:00:00`), prefs.bookingHorizonWeeks * 7),
      'yyyy-MM-dd',
    );
    const beyondHorizon = mondayYmd > horizonLimitYmd;

    return candidates
      .filter((c) => !blockedDays.has(c.date))
      .map((c) => {
        const startsAt = slotStartsAtIso(c.date, c.time);
        const past = isPastSlot(startsAt);
        const occupied =
          isSlotOccupied(startsAt, sessionsForDomain) ||
          blockedSlots.has(`${c.date}T${c.time}`);
        return {
          date: c.date,
          time: c.time,
          startsAt,
          past,
          available: !occupied && !past && !beyondHorizon,
        };
      });
  }
}
