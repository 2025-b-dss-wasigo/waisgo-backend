# Arquitectura

## Capas
- HTTP: controllers y DTOs.
- Dominio: services con reglas de negocio.
- Infraestructura: repositorios TypeORM, Redis, integraciones externas.

## Datos y almacenamiento
- PostgreSQL: datos de auth, business y audit en schemas separados.
- Redis: revocacion de tokens, OTP y limites de intentos.
- MinIO u OCI: almacenamiento de archivos.

## Modulos y dependencias
- Auth usa Identity para resolver UUIDs entre schemas.
- Audit registra eventos criticos (login, logout, cambios de password).
- Common centraliza validaciones y manejo de errores.

## Configuracion
Variables de entorno se validan con un schema en `src/config/env.schema.ts`.

## Observaciones
La separacion de schemas y el cifrado en Identity reducen el impacto de una fuga de datos.
