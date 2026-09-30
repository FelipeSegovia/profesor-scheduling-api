import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** Plantilla inicial del MVP: lunes a viernes 19:00/20:00, sábado 09:00-11:00. */
export async function seedTemplateSlots(prisma: PrismaClient): Promise<void> {
  const rows = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, time: '19:00' },
    { weekday, time: '20:00' },
  ]);
  rows.push({ weekday: 6, time: '09:00' }, { weekday: 6, time: '10:00' }, { weekday: 6, time: '11:00' });
  await prisma.templateSlot.createMany({ data: rows });
}

export async function seedPreferences(
  prisma: PrismaClient,
  overrides: Partial<{
    confirmationDeadlineHours: number;
    seriesNoticeHours: number;
    bookingHorizonWeeks: number;
  }> = {},
): Promise<void> {
  await prisma.preferences.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      confirmationDeadlineHours: 24,
      seriesNoticeHours: 48,
      bookingHorizonWeeks: 8,
      ...overrides,
    },
    update: overrides,
  });
}
