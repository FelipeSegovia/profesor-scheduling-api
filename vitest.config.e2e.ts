import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Ver vitest.config.ts: reemplaza el plugin `vite-tsconfig-paths`.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Crea/migra la base de test una sola vez antes de toda la suite. Requiere
    // NODE_ENV=test (lo fija el script `test:e2e`) para que DATABASE_URL
    // apunte a .env.test, no a la base de desarrollo.
    globalSetup: ['./test/helpers/global-setup.ts'],
    // Todos los archivos e2e comparten una sola base Postgres (`truncateAll`
    // en `beforeEach`), así que correr archivos en paralelo produce deadlocks
    // reales de Postgres (`TRUNCATE` concurrente) y choques de unique
    // constraints entre specs. Un solo archivo a la vez, en serie.
    fileParallelism: false,
  },
});
