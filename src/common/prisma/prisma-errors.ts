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
 * `meta.target` de forma amigable — el nombre del índice es lo único
 * confiable en `target` para un `P2002` disparado por este `INSERT` puntual.
 */
export function isSlotTakenViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;

  const target = err.meta?.target;
  if (typeof target === 'string') return target.includes('session_active_slot');
  if (Array.isArray(target)) return target.includes('session_active_slot');
  return false;
}
