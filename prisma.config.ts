// Configuración del CLI de Prisma 7. `schema.prisma` ya no acepta `datasource.url`
// (ni con `env(...)`): la URL de conexión que usan `migrate`, `db seed` y `studio`
// vive acá. El runtime del cliente (`PrismaService`) es independiente: arma su propio
// driver adapter desde la misma variable de entorno vía `ConfigService`.
//
// A diferencia de versiones anteriores, el CLI de Prisma 7 **no carga `.env`
// solo** (usa `c12` con `dotenv: false` para leer este archivo). Sin esta
// línea, cualquier `pnpm prisma migrate/seed/...` fallaría con "Cannot resolve
// environment variable: DATABASE_URL" a menos que alguien exporte las
// variables a mano en la shell primero.
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadDotenv();

// `env('DATABASE_URL')` de `prisma/config` lanza de inmediato si falta la
// variable, y `generate` (que solo lee el esquema, nunca conecta a la BD)
// también pasa por acá. Con eso, `pnpm install` fallaría en `postinstall` en
// un clon recién bajado, antes de que exista `.env`. Por eso se lee
// `process.env` directo con un valor de relleno: `migrate`/`seed`/`studio`
// (que sí conectan) fallan igual si el valor es el de relleno, pero fallan al
// intentar conectarse, no al cargar la configuración.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    // `node prisma/seed.ts` no alcanza: Node solo despoja tipos, no remapea
    // los imports `.js` del cliente generado a su fuente `.ts` (sí lo hacen
    // Vite/tsc, que es por qué el resto del proyecto no necesita esto). `tsx`
    // hace ese remapeo. Ver plan.md, sección de la semilla.
    seed: 'tsx prisma/seed.ts',
  },
});
