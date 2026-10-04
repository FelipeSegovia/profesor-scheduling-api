import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resuelve los alias de tsconfig.json (incluidos los que agrega
    // `nest g library`), nativamente en Vite 8 — reemplaza el plugin
    // `vite-tsconfig-paths`, que Vitest 4 marca como innecesario.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    // `.spec.tsx`: tests de las plantillas de correo (React Email, spec 006).
    include: ['**/*.spec.ts', '**/*.spec.tsx'],
  },
});
