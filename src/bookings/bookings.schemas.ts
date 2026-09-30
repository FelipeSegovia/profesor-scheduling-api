import { z } from 'zod';

/**
 * Deliberadamente permisivo: solo protege contra tipos completamente
 * equivocados. Los mensajes/códigos exactos del contrato (`MISSING_FIELDS`,
 * `INVALID_AGE`, `WEAK_PASSWORD`, ...) los produce el dominio en
 * `bookings.service.ts`, no Zod — si Zod rechazara un campo vacío con su
 * propio `ZodError`, el filtro global emitiría `VALIDATION_ERROR` genérico y
 * pisaría el contrato congelado. Ver `.specs/003-reserva-publica/plan.md`.
 */
export const createBookingSchema = z.object({
  startsAt: z.string(),
  guardianName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  childName: z.string().default(''),
  childAge: z.union([z.string(), z.number()]).default(''),
  helpRequest: z.string().optional(),
  createAccount: z.object({ password: z.string().default('') }).optional(),
});

export type CreateBookingBody = z.infer<typeof createBookingSchema>;
