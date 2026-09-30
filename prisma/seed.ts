// Semilla idempotente. Se corre con `pnpm prisma db seed` (o automáticamente
// tras `prisma migrate dev` / `migrate reset`). `prisma.config.ts` ya cargó
// `.env` antes de invocar este script, así que las variables están en
// `process.env`. Node 24 ejecuta este archivo TypeScript directamente, sin
// transpilador — ver `.specs/001-fundaciones-dominio/plan.md`.
import { hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name} en el entorno. Ver .env.example.`);
  }
  return value;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: requireEnv('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedEducator(prisma);
    await seedPreferences(prisma);
    await seedTemplateSlots(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * La educadora, única usuaria del panel privado. `upsert` por email: correrlo
 * de nuevo no crea una segunda fila ni pisa la clave si ya existe (evita
 * volver a hashear en cada ejecución sin necesidad).
 */
async function seedEducator(prisma: PrismaClient): Promise<void> {
  const email = requireEnv('SEED_EDUCATOR_EMAIL');

  const existing = await prisma.educator.findUnique({ where: { email } });
  if (existing) {
    console.log(`Educator ya existe (${email}), no se toca la clave.`);
    return;
  }

  const password = requireEnv('SEED_EDUCATOR_PASSWORD');
  await prisma.educator.create({
    data: {
      email,
      name: 'Loreto Castillo',
      passwordHash: await hash(password),
    },
  });
  console.log(`Educator creada: ${email}`);
}

/** Fila única de configuración: 24h de plazo, 48h de antelación, 8 semanas. */
async function seedPreferences(prisma: PrismaClient): Promise<void> {
  await prisma.preferences.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      confirmationDeadlineHours: 24,
      seriesNoticeHours: 48,
      bookingHorizonWeeks: 8,
    },
    update: {},
  });
}

/**
 * Plantilla inicial de `docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`: lunes a
 * viernes 19:00 y 20:00, sábado 09:00/10:00/11:00. Son 13 filas — 3 el
 * sábado, no 4: el `WORK_WEEK` del panel privado (`09:00–13:00`) contradice
 * el doc canónico, que es la fuente que manda.
 */
async function seedTemplateSlots(prisma: PrismaClient): Promise<void> {
  const weekdaySlots = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, time: '19:00' },
    { weekday, time: '20:00' },
  ]);
  const saturdaySlots = ['09:00', '10:00', '11:00'].map((time) => ({
    weekday: 6,
    time,
  }));
  const slots = [...weekdaySlots, ...saturdaySlots];

  for (const slot of slots) {
    await prisma.templateSlot.upsert({
      where: { weekday_time: slot },
      create: slot,
      update: {},
    });
  }
  console.log(`TemplateSlot: ${slots.length} cupos asegurados.`);
}

await main();
