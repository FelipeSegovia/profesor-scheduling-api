import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Trunca todas las tablas de la base de test entre casos de e2e. Se llama en
 * `beforeEach`, no en `afterEach`: así un test que falla deja sus datos para
 * inspeccionar hasta que corre el siguiente, en vez de borrarlos de inmediato.
 *
 * La lista de tablas se lee de `pg_tables` en vez de escribirse a mano, para
 * no tener que acordarse de actualizar este helper cada vez que una spec
 * agrega un modelo al esquema.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
}
