# API — contrato HTTP

Fuente de la verdad para los frontends (`public-parents-scheduling-web/`,
`private-profesor-scheduling/`) y para cualquier lectura futura de este repo.
Hay dos archivos:

- **[`openapi.json`](./openapi.json)**: el esquema OpenAPI 3.0 exacto, generado
  desde el código (no escrito a mano). Es lo que hay que leer para tipos,
  parámetros y formas de respuesta exactas — por ejemplo con
  [`openapi-typescript`](https://openapi-ts.dev/) para generar tipos del lado
  del frontend, o importándolo en Postman/Insomnia.
- **Este archivo**: un resumen humano de alto nivel, para orientarse rápido
  sin parsear el JSON. No repite lo que ya dice el JSON (parámetros, schemas);
  para eso, `openapi.json`.

## Cómo regenerarlo

```bash
pnpm db:up            # Postgres tiene que estar arriba
pnpm docs:openapi      # nest build + vuelca /api/docs-json a openapi.json
```

Correr después de cualquier spec que agregue o cambie un endpoint (ver
`.specs/<NNN>-.../tasks.md`, tarea de "verificación de Swagger"). El comando
compila el proyecto de verdad (`nest build`) en vez de usar un transpilador
rápido tipo `tsx`/esbuild: estos no emiten los metadatos de decoradores que
Nest necesita para inyectar dependencias por tipo, y romperían la
instanciación de la app al generar el documento.

`openapi.json` es exactamente lo que sirve `GET /api/docs-json` con el
servidor corriendo fuera de producción (`NODE_ENV !== 'production'`) — mismo
título, versión y esquema, verificado byte a byte contra el servidor real. En
producción esa ruta no existe; este archivo es la única forma de consultar el
contrato sin levantar un entorno de desarrollo.

## Estado

Hay **13 rutas** documentadas (todas bajo el prefijo `/api`), de las specs
`001-fundaciones-dominio` (solo `/health`), `002-documentacion-swagger`
(Swagger montado) y `003-reserva-publica` (el resto). Ninguna requiere
autenticación de la educadora todavía — eso es una spec futura (panel
privado).

| Tag | Ruta | Método | Qué hace | Auth |
| --- | --- | --- | --- | --- |
| health | `/api/health` | GET | Prueba de vida de la API y de Postgres. | — |
| slots | `/api/slots` | GET | Cupos de lunes a sábado para la semana de `weekStart` (query, `YYYY-MM-DD`). | — |
| bookings | `/api/bookings` | POST | Reserva una sesión suelta. | `Bearer` opcional (autocompleta/actualiza el perfil si hay sesión). |
| bookings | `/api/bookings/{id}` | GET | Consulta una reserva por id. | — (mismo comportamiento que el mock que reemplaza: no valida quién pregunta). |
| sessions | `/api/sessions/confirm/{token}` | POST | Confirma una sesión pendiente. Idempotente. | — (el token del correo es la autenticación). |
| sessions | `/api/sessions/cancel/{token}` | POST | Cancela una sesión. Idempotente. | — (ídem). |
| auth | `/api/auth/register` | POST | Crea la cuenta opcional del apoderado. | — |
| auth | `/api/auth/login` | POST | Inicia sesión. | — |
| auth | `/api/auth/logout` | POST | Cierra sesión (siempre 204). | `Bearer` opcional. |
| auth | `/api/auth/me` | GET | Perfil de la cuenta con sesión activa. | `Bearer` **requerido**. |
| auth | `/api/auth/email-status` | GET | Si un correo (`?email=`) ya tiene cuenta. Nunca falla. | — |
| auth | `/api/auth/forgot` | POST | Pide un enlace de recuperación de clave. Siempre `{ ok: true }`. | — |
| auth | `/api/auth/reset` | POST | Restablece la clave con el token del correo. | — |

## Formato de error

Todas las respuestas de error tienen esta forma (`AllExceptionsFilter`,
`src/common/errors/exception.filter.ts`):

```json
{ "error": "Mensaje en español para mostrar al apoderado.", "code": "CODIGO_EN_INGLES" }
```

`code` está **ausente** (no `null`) en dos casos puntuales del contrato
congelado: `GET /api/slots` sin `weekStart`, y `GET /api/bookings/:id` con un
id inexistente. El resto de los errores siempre trae `code`; los valores
posibles están en el esquema (`components` no los enumera porque no son un
modelo de datos, sino un enum documentado en
`.specs/003-reserva-publica/spec.md`): `INVALID_AGE`, `MISSING_FIELDS`,
`EMAIL_MISMATCH`, `ACCOUNT_EXISTS`, `WEAK_PASSWORD`, `PAST_SLOT`,
`SLOT_TAKEN`, `HELP_REQUEST_TOO_LONG`, `INVALID_TOKEN`, `NOT_PENDING`,
`CANCEL_NOT_ALLOWED`, `NO_SESSION`, `NO_ACCOUNT`, `INVALID_RESET`,
`INVALID_CREDENTIALS`, `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`.

## Autenticación del apoderado

`Bearer <jwt>` en `Authorization`. El JWT no tiene refresh: expira según
`JWT_EXPIRES_IN` y hay que volver a iniciar sesión. Restablecer la clave
invalida cualquier JWT emitido antes (`GET /api/auth/me` con un token viejo
responde `401 NO_SESSION` después de un reset), aunque ese JWT todavía no
haya expirado por tiempo.

## Qué no hay todavía

- Ningún endpoint de la educadora (panel privado): llega en una spec futura.
- Series semanales, bloqueos de cupos, envío real de correos (`OutboxEmail`
  se llena pero nada la despacha), job de vencimiento de confirmación.

Detalle de reglas de negocio y de qué endpoint viene de qué spec:
[`../.specs/003-reserva-publica/spec.md`](../.specs/003-reserva-publica/spec.md),
[`../CLAUDE.md`](../CLAUDE.md).
