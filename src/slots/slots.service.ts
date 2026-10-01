import { Injectable } from '@nestjs/common';
import { addDays, format } from 'date-fns';
import {
  chileDateToColumn,
  chileDayRange,
  columnToChileDate,
  isPastSlot,
  slotStartsAtIso,
  toChileDateString,
  toChileTimeString,
  weekDaysMonSatYmd,
  weekDaysMonSunYmd,
  weekMondayYmd,
  weekdayOf,
} from '../domain/time.js';
import type { SessionStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveSlotState, type SlotCell } from './slot-grid.js';
import type { SlotView } from './slots.types.js';

const ACTIVE_STATUSES: SessionStatus[] = ['PENDING', 'CONFIRMED'];

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cupos de lunes a domingo de la semana que empieza en `mondayYmd`, con su
   * `state` resuelto (libre, con sesión, bloqueado por día/cupo, o fuera del
   * horizonte de reserva). A diferencia de `buildWeekSlots` (contrato público
   * congelado), conserva todos los candidatos: un día bloqueado con una
   * sesión activa se ve `BOOKED`, no desaparece. También incluye como
   * candidato cualquier sesión activa de la semana aunque su hora ya no esté
   * en la plantilla vigente (la educadora puede agendar fuera de plantilla;
   * ver `.specs/004-panel-educadora/spec.md`). Ver
   * `.specs/004-panel-educadora/plan.md`, sección "Cupos".
   */
  async buildWeekGrid(mondayYmd: string): Promise<SlotCell[]> {
    const days = weekDaysMonSunYmd(mondayYmd);
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

    const [weekStart] = chileDayRange(days[0]!);
    const [, weekEnd] = chileDayRange(days[days.length - 1]!);
    const sessionsInWeek = await this.prisma.session.findMany({
      where: { startsAt: { gte: weekStart, lt: weekEnd }, status: { in: ACTIVE_STATUSES } },
      include: { child: true, guardian: true },
    });
    const sessionsByStartsAt = new Map(
      sessionsInWeek.map((s) => [s.startsAt.toISOString(), s]),
    );

    const templateCandidates = days.flatMap((date) => {
      const weekday = weekdayOf(date);
      return templates.filter((t) => t.weekday === weekday).map((t) => ({ date, time: t.time }));
    });
    const templateKeys = new Set(templateCandidates.map((c) => `${c.date}T${c.time}`));

    // Sesiones activas cuya hora ya no está en la plantilla: igual deben
    // aparecer en la agenda del panel, o la cita "desaparecería" al editar la
    // plantilla (regla canónica: cambiar la plantilla no borra sesiones).
    const offTemplateCandidates: { date: string; time: string }[] = [];
    for (const session of sessionsInWeek) {
      const date = toChileDateString(session.startsAt);
      if (!days.includes(date)) continue;
      const time = toChileTimeString(session.startsAt);
      const key = `${date}T${time}`;
      if (!templateKeys.has(key) && !offTemplateCandidates.some((c) => `${c.date}T${c.time}` === key)) {
        offTemplateCandidates.push({ date, time });
      }
    }

    const candidates = [...templateCandidates, ...offTemplateCandidates];

    const horizonLimitYmd = format(
      addDays(new Date(`${weekMondayYmd()}T12:00:00`), prefs.bookingHorizonWeeks * 7),
      'yyyy-MM-dd',
    );
    const beyondHorizon = mondayYmd > horizonLimitYmd;

    return candidates.map((c) => {
      const startsAt = slotStartsAtIso(c.date, c.time);
      const past = isPastSlot(startsAt);
      const session = sessionsByStartsAt.get(startsAt);
      const dayBlocked = blockedDays.has(c.date);
      const slotBlocked = blockedSlots.has(`${c.date}T${c.time}`);
      const state = resolveSlotState({
        occupied: Boolean(session),
        dayBlocked,
        slotBlocked,
        beyondHorizon,
      });

      return {
        date: c.date,
        time: c.time,
        startsAt,
        past,
        state,
        dayBlocked,
        session: session
          ? {
              id: session.id,
              status: session.status,
              childId: session.childId,
              guardianId: session.guardianId,
              childName: session.child.name,
              guardianName: session.guardian.name,
              helpRequest: session.helpRequest ?? undefined,
              seriesId: session.seriesId ?? undefined,
            }
          : undefined,
      };
    });
  }

  /**
   * Cupos de lunes a sábado para la semana que empieza en `mondayYmd` —
   * contrato público congelado. Proyección de `buildWeekGrid`: un día con
   * `DayBlock` se omite por completo (sin importar si tiene una sesión activa
   * o no), igual que antes del refactor de la spec 004. Ver
   * `.specs/003-reserva-publica/plan.md`, sección "Cálculo de cupos".
   */
  async buildWeekSlots(mondayYmd: string): Promise<SlotView[]> {
    const grid = await this.buildWeekGrid(mondayYmd);
    const monSat = new Set(weekDaysMonSatYmd(mondayYmd));

    return grid
      .filter((c) => monSat.has(c.date) && !c.dayBlocked)
      .map((c) => ({
        date: c.date,
        time: c.time,
        startsAt: c.startsAt,
        past: c.past,
        available: c.state === 'FREE' && !c.past,
      }));
  }
}
