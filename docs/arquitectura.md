# Arquitectura

## Objetivo
Describir la arquitectura por capas y las dependencias clave del sistema.

## Alcance
Aplica a los modulos internos y las integraciones externas (DB, Redis, storage, correo).

Descripcion: Resume la organizacion en capas, los componentes principales y los
servicios externos involucrados.

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
