import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { chileDateToColumn, columnToChileDate } from '../src/domain/time.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { truncateAll } from './helpers/db.js';

/**
 * Prueba, contra Postgres real, los dos invariantes de esquema que
 * `spec.md` exige y que un mock en memoria no puede demostrar: el índice
 * único parcial `session_active_slot` (migración
 * `20260929202708_init/migration.sql`) y que la columna `@db.Date` de
 * `DayBlock` no corre el día.
 */
describe('Invariantes de esquema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedGuardianAndChild() {
    const guardian = await prisma.guardian.create({
      data: { name: 'Familia Prueba', email: 'prueba@example.com', phone: '+56900000000' },
    });
    const child = await prisma.child.create({
      data: { guardianId: guardian.id, name: 'Niño Prueba', normalizedName: 'niño prueba', age: 8 },
    });
    return { guardian, child };
  }

  describe('session_active_slot: un cupo activo no se reserva dos veces', () => {
    it('dos sesiones PENDING/CONFIRMED en el mismo startsAt: la segunda falla', async () => {
      const { guardian, child } = await seedGuardianAndChild();
      const startsAt = new Date('2026-10-05T22:00:00Z');

      await prisma.session.create({
        data: {
          childId: child.id,
          guardianId: guardian.id,
          startsAt,
          status: 'PENDING',
          confirmToken: 'confirm-1',
          cancelToken: 'cancel-1',
          createdBy: 'GUARDIAN',
        },
      });

      await expect(
        prisma.session.create({
          data: {
            childId: child.id,
            guardianId: guardian.id,
            startsAt,
            status: 'CONFIRMED',
            confirmToken: 'confirm-2',
            cancelToken: 'cancel-2',
            createdBy: 'GUARDIAN',
          },
        }),
      ).rejects.toThrow();
    });

    it('dos sesiones CANCELLED/NOT_CONFIRMED en el mismo startsAt: ambas se permiten', async () => {
      const { guardian, child } = await seedGuardianAndChild();
      const startsAt = new Date('2026-10-06T22:00:00Z');

      await prisma.session.create({
        data: {
          childId: child.id,
          guardianId: guardian.id,
          startsAt,
          status: 'CANCELLED',
          confirmToken: 'confirm-3',
          cancelToken: 'cancel-3',
          createdBy: 'GUARDIAN',
        },
      });

      const second = await prisma.session.create({
        data: {
          childId: child.id,
          guardianId: guardian.id,
          startsAt,
          status: 'NOT_CONFIRMED',
          confirmToken: 'confirm-4',
          cancelToken: 'cancel-4',
          createdBy: 'SYSTEM',
        },
      });

      expect(second.startsAt).toEqual(startsAt);
      const count = await prisma.session.count({ where: { startsAt } });
      expect(count).toBe(2);
    });
  });

  describe('DayBlock.date: la columna @db.Date no corre el día', () => {
    it('guardar 2026-10-05 y releerlo devuelve 2026-10-05', async () => {
      const ymd = '2026-10-05';
      await prisma.dayBlock.create({ data: { date: chileDateToColumn(ymd) } });

      const saved = await prisma.dayBlock.findUnique({ where: { date: chileDateToColumn(ymd) } });
      expect(saved).not.toBeNull();
      expect(columnToChileDate(saved!.date)).toBe(ymd);
    });

    it.each(['2026-01-01', '2026-06-30', '2026-12-31'])(
      '%s hace un viaje de ida y vuelta exacto a través de Postgres',
      async (ymd) => {
        await prisma.dayBlock.create({ data: { date: chileDateToColumn(ymd) } });
        const saved = await prisma.dayBlock.findUnique({
          where: { date: chileDateToColumn(ymd) },
        });
        expect(columnToChileDate(saved!.date)).toBe(ymd);
      },
    );
  });
});
