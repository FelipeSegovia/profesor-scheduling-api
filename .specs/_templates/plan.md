# Plan: Refresh tokens

## Archivos a tocar

- src/auth/tokens.ts (nuevo)
- src/api/auth.controller.ts
- src/middleware/auth.ts

## Diseño

- Refresh tokens firmados con JWT, almacenados hasheados en DB
- Rotación: cada uso de refresh invalida el anterior

## Verificación end-to-end

curl -X POST /auth/refresh -> debe devolver 200 con nuevo access_token
