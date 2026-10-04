import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Opciones de CORS de la API (`src/main.ts`). `Content-Disposition` se expone
 * porque el panel baja el PDF de la ficha clínica con `fetch` desde otro
 * origen y el navegador solo deja leer a JavaScript los headers "seguros"; sin
 * esto el panel no ve el `filename` que manda la API (spec 007).
 */
export function buildCorsOptions(origin: string[]): CorsOptions {
  return { origin, exposedHeaders: ['Content-Disposition'] };
}
