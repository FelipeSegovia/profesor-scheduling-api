import { execFileSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

/**
 * `globalSetup` de Vitest para `pnpm test:e2e`: corre una sola vez antes de
 * toda la suite, en un proceso separado que **no** pasa por `AppModule` ni
 * por `ConfigModule` — por eso carga `.env.test` a mano acá, en vez de
 * depender de que Nest ya lo haya hecho.
 *
 * Crea la base `agendamientos_test` si no existe (el `docker-compose.yml`
 * solo trae `profesor_scheduling`) y aplica las migraciones con
 * `prisma migrate deploy` — nunca `migrate dev`, que puede preguntar
 * interactivamente o generar una migración nueva.
 */
export default async function globalSetup(): Promise<void> {
  loadDotenv({ path: '.env.test' });
  const testUrl = requireEnv('DATABASE_URL');
  await ensureDatabaseExists(testUrl);

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} no está definida. ¿Falta cargar .env.test? Ver .env.test.example.`,
    );
  }
  return value;
}

async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!databaseName) {
    throw new Error(`DATABASE_URL sin nombre de base: ${connectionString}`);
  }

  // Se conecta a la base "postgres" (siempre existe) para poder crear la de
  // test si hace falta: no se puede crear una base estando conectado a ella.
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (rowCount === 0) {
      // El nombre no puede parametrizarse en CREATE DATABASE; viene de
      // DATABASE_URL de .env.test, no de input externo.
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }
}
