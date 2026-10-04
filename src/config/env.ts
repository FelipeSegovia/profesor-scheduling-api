import { z } from 'zod';

/**
 * Opcional donde una variable vacía (`RESEND_API_KEY=` en el `.env`) cuenta
 * como no configurada, en vez de fallar la validación del valor.
 */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

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

  /// Correo (spec 006). Sin `RESEND_API_KEY` los correos van al log (transporte
  /// de consola); las reglas cruzadas están en `superRefine`, abajo.
  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: optional(z.string()),
  EMAIL_REPLY_TO: optional(z.email()),
  /// Sandbox de Resend: desvía todos los destinatarios a esta dirección.
  EMAIL_REDIRECT_TO: optional(z.email()),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),

  OBSERVE_APP_KEY: z.string().optional(),
  OBSERVE_APP_SECRET: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
    ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'es obligatoria cuando hay RESEND_API_KEY' });
  }
  if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'es obligatoria en producción' });
  }
  if (env.NODE_ENV === 'production' && env.EMAIL_REDIRECT_TO) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_REDIRECT_TO'],
      message: 'no se permite en producción: desviaría los correos reales',
    });
  }
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
