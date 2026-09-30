import { z } from 'zod';

/** Ver `.specs/003-reserva-publica/plan.md`, sección "Zod: principio de diseño". */
export const registerSchema = z.object({
  email: z.string().default(''),
  password: z.string().default(''),
  guardianName: z.string().default(''),
  phone: z.string().default(''),
});
export type RegisterBody = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().default(''),
  password: z.string().default(''),
});
export type LoginBody = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({
  email: z.string().default(''),
});
export type ForgotBody = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({
  token: z.string().default(''),
  password: z.string().default(''),
});
export type ResetBody = z.infer<typeof resetSchema>;
