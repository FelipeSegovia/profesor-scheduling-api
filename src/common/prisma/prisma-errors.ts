import { Prisma } from '../../generated/prisma/client.js';

/**
 * Detecta si un error de Prisma es la violación del índice único parcial
 * `session_active_slot` (creado a mano en la migración inicial, ver
 * `.specs/001-fundaciones-dominio/plan.md`, porque Prisma no modela índices
 * únicos parciales en `schema.prisma`). Es la única fuente de verdad real
 * contra la carrera de dos reservas simultáneas sobre el mismo cupo: el
 * chequeo optimista antes de la transacción solo reduce la ventana, no la
 * cierra.
 *
 * Como el índice no está en el esquema, Prisma no puede nombrar la columna en
 * `meta.target` de forma amigable. Con el driver adapter (`@prisma/adapter-pg`)
 * el nombre del índice no viaja en `meta.target` sino en
 * `meta.driverAdapterError.cause.constraint.index` — verificado contra
 * Postgres real en esta versión (`@prisma/adapter-pg@7.10.0`). Se comprueban
 * ambas formas por si una versión futura del adapter vuelve a mover el dato.
 */
export function isSlotTakenViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;

  const target = err.meta?.target;
  if (typeof target === 'string' && target.includes('session_active_slot')) return true;
  if (Array.isArray(target) && target.includes('session_active_slot')) return true;

  const driverAdapterError = err.meta?.driverAdapterError as
    | { cause?: { constraint?: { index?: string } } }
    | undefined;
  return driverAdapterError?.cause?.constraint?.index === 'session_active_slot';
}
