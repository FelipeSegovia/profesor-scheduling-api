# profesor-scheduling-api

Backend del agendamiento de la educadora diferencial. Reemplaza los mocks MSW de [`private-profesor-scheduling/`](../private-profesor-scheduling/) y [`public-parents-scheduling-web/`](../public-parents-scheduling-web/) con base de datos, autenticación y las reglas de negocio de [`../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md`](../docs/mvp/REQUERIMIENTOS_FUNCIONALES.md).

Estado actual y contexto técnico completo: [CLAUDE.md](CLAUDE.md). Reglas de negocio de cada superficie: [`../AGENTS_PRIVATE.md`](../AGENTS_PRIVATE.md) y [`../AGENTS_PUBLIC.md`](../AGENTS_PUBLIC.md).

## Stack

NestJS 12 + TypeScript 6 + Prisma 7 (Postgres) + Vitest 4. Node 24, pnpm. ESM real: todo import relativo lleva extensión `.js` aunque el archivo sea `.ts`.

## Requisitos previos

- **Node.js 24+** (verifica con `node --version`)
- **pnpm 12+** (verifica con `pnpm --version`; si no tienes pnpm, instala con `npm install -g pnpm`)
- **Docker Desktop** corriendo en tu máquina (verifica con `docker ps`)

## Primeros pasos — guía detallada

### 1. Clonar el repo y entrar en la carpeta

```bash
cd /ruta/a/agendamientos/profesor-scheduling-api
```

### 2. Instalar dependencias

```bash
pnpm install
```

El `postinstall` automático corre `prisma generate`, que crea el cliente tipado de Prisma en `src/generated/prisma/`. Si ves errores sobre `DATABASE_URL` no resuelto, es normal — la BD aún no está arriba, y Prisma sigue sin conectarse, pero el cliente ya se generó.

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Ahora edita `.env` y ajusta los valores si hace falta. Mínimo:
- `DATABASE_URL`: mantén el default (Postgres en Docker, puerto 5433) o apunta a tu BD.
- `JWT_SECRET`: debe tener **al menos 32 caracteres**; el example da un texto de ejemplo que funciona para desarrollo.
- `CORS_ORIGINS`: si accedes desde una máquina diferente, agrega su origen aquí.

### 4. Arrancar Postgres en Docker

```bash
pnpm db:up
```

Postgres arranca en puerto 5433 (no 5432, para no chocar con una instalación local). Espera a que el container reporte "healthy":

```bash
docker compose ps
# Deberías ver: profesor-scheduling-api-db-1 ... Up (healthy)
```

Si el status dice "starting", espera 5-10 segundos más.

### 5. Aplicar migraciones

```bash
pnpm db:migrate
```

Crea todas las tablas de Prisma en la base (educadora, guardián, niño, sesión, preferencias, cupos de plantilla, bloqueos, etc.). Salida esperada:

```
Applying migration `20260929202708_init`
... [nombres de tablas creadas]
Your database is now in sync with your schema.
```

### 6. Semilla: datos iniciales

```bash
pnpm db:seed
```

Crea:
- Una educadora (email y clave desde `.env`: `educadora@example.com` / `cambia-esta-clave`)
- 13 cupos de plantilla semanal (lunes–viernes 19:00 y 20:00, sábado 9:00/10:00/11:00)
- Una fila de preferencias (plazo de confirmación 24h, antelación de aviso 48h, horizonte de reserva 8 semanas)

Es idempotente: correr dos veces no crea duplicados. Salida esperada:

```
Educator creada: educadora@example.com
TemplateSlot: 13 cupos asegurados.
🌱 The seed command has been executed.
```

### 7. Arrancar el servidor

```bash
pnpm start:dev
```

Esperarás algo así:

```
[Nest] 12345 - 09/29/2026, 5:00:00 PM    LOG [NestFactory] Starting Nest application...
[Nest] 12345 - 09/29/2026, 5:00:00 PM    LOG [PrismaService] Conectado a la base de datos
[Nest] 12345 - 09/29/2026, 5:00:00 PM    LOG [NestApplication] Nest application successfully started
```

Si ves un error de "EADDRINUSE: address already in use :::3000", otro proceso ocupa el puerto 3000; mata el proceso con `lsof -ti:3000 | xargs kill -9` e intenta de nuevo.

**Documentación interactiva (Swagger UI):**

Una vez `pnpm start:dev` está corriendo, abre en tu navegador:

```
http://localhost:3000/api/docs
```

Verás la documentación interactiva de todos los endpoints. En producción (`NODE_ENV=production`), esta ruta no está disponible.

### 8. Verificar que funciona

Abre una terminal nueva (sin matar `pnpm start:dev`) y:

```bash
curl http://localhost:3000/api/health
# Esperado: {"status":"ok"}
```

Si la BD está arriba y sana, recibirás 200. Si Postgres no responde:

```bash
curl http://localhost:3000/api/health -v
# Status: 503
# Body: {"message":"La base de datos no responde.","error":"Service Unavailable","statusCode":503}
```

En ese caso, verifica con `docker compose ps` que el contenedor está healthy.

### 9. Probar el flujo de reserva a mano

Con el servidor corriendo y la base sembrada (pasos 5-6):

```bash
# Cupos de una semana (lunes en YYYY-MM-DD)
curl "http://localhost:3000/api/slots?weekStart=2026-10-05"

# Reservar una sesión suelta
curl -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -d '{
    "startsAt": "2026-10-05T22:00:00.000Z",
    "guardianName": "Ana Pérez",
    "email": "ana@correo.cl",
    "phone": "+56911111111",
    "childName": "Sofía",
    "childAge": 8
  }'
# Guarda el confirmToken/cancelToken de la respuesta.

# Confirmar o cancelar
curl -X POST http://localhost:3000/api/sessions/confirm/<confirmToken>
curl -X POST http://localhost:3000/api/sessions/cancel/<cancelToken>

# Cuenta opcional
curl -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"ana@correo.cl","password":"clave12345678","guardianName":"Ana Pérez","phone":"+56911111111"}'
```

## Comandos

```bash
pnpm start:dev                  # nest start --watch (PORT o 3000)
pnpm build                      # nest build
pnpm start:prod                 # node dist/main
pnpm lint                       # oxlint --type-aware src/ test/
pnpm format                     # prettier --write

pnpm test                       # vitest run — solo **/*.spec.ts (dominio)
pnpm test:e2e                   # contra una base de test separada (.env.test)

pnpm db:up                      # docker compose up -d db
pnpm db:migrate                 # prisma migrate dev
pnpm db:seed                    # prisma db seed (idempotente)
```

## Flujo SDD

Las features viven en [`.specs/<NNN>-<nombre>/`](.specs/), con `spec.md` aprobado antes de escribir código. Ver [CLAUDE.md](CLAUDE.md) para las reglas completas.
