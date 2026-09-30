# Spec: Refresh tokens para autenticación

## Objetivo

Permitir que los usuarios renueven su sesión sin volver a loguearse.

## Requisitos funcionales

- El refresh token dura 30 días
- El access token dura 15 minutos
- Endpoint: POST /auth/refresh

## Fuera de alcance

- No se implementa revocación por dispositivo en esta iteración

## Criterios de aceptación

- [ ] Un token expirado devuelve 401
- [ ] Un refresh válido devuelve nuevo access token
