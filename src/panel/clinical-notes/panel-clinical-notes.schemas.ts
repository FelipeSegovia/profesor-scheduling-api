import { z } from 'zod';
import { chileDateToColumn, columnToChileDate } from '../../domain/time.js';

/** `YYYY-MM-DD` y un día que existe (no `2026-02-31`). */
const dateSchema = z
  .string('La fecha es obligatoria.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato YYYY-MM-DD.')
  .refine(
    (ymd) => columnToChileDate(chileDateToColumn(ymd)) === ymd,
    'La fecha no existe.',
  );

const titleSchema = z
  .string('El título es obligatorio.')
  .trim()
  .min(1, 'El título es obligatorio.')
  .max(120, 'El título no puede pasar de 120 caracteres.');

const bodySchema = z
  .string('El texto es obligatorio.')
  .trim()
  .min(1, 'El texto es obligatorio.')
  .max(10_000, 'El texto no puede pasar de 10.000 caracteres.');

/**
 * `notifyGuardian` es obligatorio: el panel siempre lo pide de forma explícita
 * (spec 007). Si `true`, la misma transacción deja el correo al apoderado en el
 * outbox.
 */
export const createNoteSchema = z.object({
  date: dateSchema,
  title: titleSchema,
  body: bodySchema,
  sessionId: z.string().min(1).optional(),
  notifyGuardian: z.boolean('Indica si el registro se envía al apoderado.'),
});
export type CreateNoteBody = z.infer<typeof createNoteSchema>;

/**
 * Cualquier subconjunto. `sessionId: null` desvincula la sesión. No acepta
 * `notifyGuardian`: editar nunca manda un correo (la clave, si llega, se
 * descarta).
 */
export const updateNoteSchema = z.object({
  date: dateSchema.optional(),
  title: titleSchema.optional(),
  body: bodySchema.optional(),
  sessionId: z.string().min(1).nullable().optional(),
});
export type UpdateNoteBody = z.infer<typeof updateNoteSchema>;
