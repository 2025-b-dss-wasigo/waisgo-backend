# Arquitectura

## Capas
- HTTP: controllers y DTOs.
- Dominio: services con reglas de negocio.
- Infraestructura: repositorios TypeORM, Redis, integraciones externas.

## Datos y almacenamiento
- PostgreSQL: auth, business y audit en schemas separados.
- Redis: revocacion de tokens, OTP y limites de intentos.
- MinIO u OCI: almacenamiento de archivos.

## Modulos y dependencias
- auth depende de identity para resolver UUIDs entre schemas.
- audit registra eventos criticos (login, logout, reset, accesos denegados).
- common centraliza validaciones y manejo de errores.

## Configuracion
Variables de entorno validadas en `src/config/env.schema.ts`.

## Observaciones
La separacion de schemas y el cifrado en Identity reducen el impacto de una fuga de datos.
