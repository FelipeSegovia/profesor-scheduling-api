import { z } from 'zod';

export const createGuardianSchema = z.object({
  name: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
});
export type CreateGuardianBody = z.infer<typeof createGuardianSchema>;

export const updateGuardianSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
});
export type UpdateGuardianBody = z.infer<typeof updateGuardianSchema>;

/** Sin rango de edad: la educadora puede guardar una edad fuera de 3-13 (fuera del MVP público). */
export const createChildSchema = z.object({
  name: z.string().default(''),
  age: z.number().default(0),
});
export type CreateChildBody = z.infer<typeof createChildSchema>;

export const updateChildSchema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
});
export type UpdateChildBody = z.infer<typeof updateChildSchema>;
