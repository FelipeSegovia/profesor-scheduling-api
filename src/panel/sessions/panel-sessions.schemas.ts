import { z } from 'zod';

/** Zod deliberadamente permisivo: los mensajes/códigos los produce el dominio. */
export const createSessionSchema = z.object({
  childId: z.string().default(''),
  startsAt: z.string().default(''),
  helpRequest: z.string().optional(),
});
export type CreateSessionBody = z.infer<typeof createSessionSchema>;

export const moveSessionSchema = z.object({
  startsAt: z.string().default(''),
});
export type MoveSessionBody = z.infer<typeof moveSessionSchema>;

export const createSeriesSchema = z.object({
  childId: z.string().default(''),
  weekday: z.number().int().min(0).max(6).default(-1),
  time: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
});
export type CreateSeriesBody = z.infer<typeof createSeriesSchema>;
