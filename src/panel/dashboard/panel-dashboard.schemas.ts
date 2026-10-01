import { z } from 'zod';
import { todayChileYmd } from '../../domain/time.js';

export const panelSummaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe tener el formato YYYY-MM-DD')
    .default(() => todayChileYmd()),
});
export type PanelSummaryQuery = z.infer<typeof panelSummaryQuerySchema>;
