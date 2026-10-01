import { z } from 'zod';

/**
 * Esquema de variables de entorno. `ConfigModule.forRoot({ validate })` lo
 * aplica al arrancar: si falta o es inválida una variable, el proceso no
 * levanta, en vez de fallar en la primera petición que la necesite.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  /// JWT de la educadora: secreto separado del apoderado para que un token de
  /// una superficie nunca sirva en la otra (ver `.specs/004-panel-educadora/plan.md`).
  EDUCATOR_JWT_SECRET: z.string().min(32),
  EDUCATOR_JWT_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  PUBLIC_WEB_URL: z.url(),

  SEED_EDUCATOR_EMAIL: z.email().optional(),
  SEED_EDUCATOR_PASSWORD: z.string().min(8).optional(),

  // Opcionales en la spec 001; pasan a requeridas en la 002, cuando exista el
  // adaptador que envía correos de verdad.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REDIRECT_TO: z.string().optional(),

  OBSERVE_APP_KEY: z.string().optional(),
  OBSERVE_APP_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validador que recibe `ConfigModule.forRoot`. Lanza con un mensaje legible si
 * falta o es inválida una variable, y Nest aborta el arranque con ese error.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas o faltantes:\n${details}`);
  }
  return result.data;
}
