import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe tener el formato YYYY-MM-DD');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'time debe tener el formato HH:mm');

export const blockDaySchema = z.object({ date: dateSchema });
export type BlockDayBody = z.infer<typeof blockDaySchema>;

export const blockSlotSchema = z.object({ date: dateSchema, time: timeSchema });
export type BlockSlotBody = z.infer<typeof blockSlotSchema>;

const workDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  available: z.boolean(),
  start: z.string().nullable(),
  end: z.string().nullable(),
});

export const updateTemplateSchema = z.object({
  workWeek: z.array(workDaySchema).default([]),
});
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;

export const updatePreferencesSchema = z.object({
  confirmationDeadlineHours: z.number().default(0),
  seriesNoticeHours: z.number().default(0),
  bookingHorizonWeeks: z.number().default(0),
});
export type UpdatePreferencesBody = z.infer<typeof updatePreferencesSchema>;
