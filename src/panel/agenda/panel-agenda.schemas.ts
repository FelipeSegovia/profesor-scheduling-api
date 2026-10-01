import { z } from 'zod';
import { weekdayOf } from '../../domain/time.js';

/** `weekStart` obligatorio y debe ser un lunes (`YYYY-MM-DD`). */
export const panelAgendaQuerySchema = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart debe tener el formato YYYY-MM-DD')
    .refine((value) => weekdayOf(value) === 1, 'weekStart debe ser un lunes'),
});
export type PanelAgendaQuery = z.infer<typeof panelAgendaQuerySchema>;
