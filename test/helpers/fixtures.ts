import { hash } from 'argon2';
import type { Educator, PrismaClient } from '../../src/generated/prisma/client.js';

/** Plantilla inicial del MVP: lunes a viernes 19:00/20:00, sábado 09:00-11:00. */
export async function seedTemplateSlots(prisma: PrismaClient): Promise<void> {
  const rows = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, time: '19:00' },
    { weekday, time: '20:00' },
  ]);
  rows.push({ weekday: 6, time: '09:00' }, { weekday: 6, time: '10:00' }, { weekday: 6, time: '11:00' });
  await prisma.templateSlot.createMany({ data: rows });
}

/** Educator de prueba con clave conocida, para los e2e del panel. */
export async function seedEducator(
  prisma: PrismaClient,
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<Educator> {
  const email = overrides.email ?? 'loreto@example.com';
  const password = overrides.password ?? 'clave12345678';
  return prisma.educator.create({
    data: { email, name: overrides.name ?? 'Loreto Castillo', passwordHash: await hash(password) },
  });
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
