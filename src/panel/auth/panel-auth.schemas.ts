import { z } from 'zod';

/** Zod deliberadamente permisivo: los mensajes/códigos los produce el dominio. */
export const panelLoginSchema = z.object({
  email: z.string().default(''),
  password: z.string().default(''),
});
export type PanelLoginBody = z.infer<typeof panelLoginSchema>;

export const panelPasswordSchema = z.object({
  currentPassword: z.string().default(''),
  newPassword: z.string().default(''),
});
export type PanelPasswordBody = z.infer<typeof panelPasswordSchema>;
