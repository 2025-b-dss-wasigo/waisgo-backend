# C4 y STRIDE

Este documento resume la estructura del sistema (C4) y los controles de seguridad
implementados para apoyar el analisis STRIDE.

## C4 - Contexto
- Usuarios finales: pasajeros, conductores y administradores.
- Sistema principal: WasiGo Backend (API).
- Sistemas externos: PayPal, MinIO u OCI Object Storage, correo SMTP.
- Infraestructura: PostgreSQL, Redis.

## C4 - Contenedores
- API (NestJS): expone endpoints REST, aplica auth y validaciones.
- Base de datos (PostgreSQL): datos de auth, business y audit en schemas separados.
- Cache y sesiones (Redis): revocacion de tokens, OTP y limites.
- Almacenamiento de archivos (MinIO/OCI): documentos y recursos externos.
- Notificaciones (SMTP): envio de correos de verificacion y reset.

## C4 - Componentes (backend)
- auth: login, register, reset, refresh y logout.
- identity: mapeo cifrado entre auth y business.
- audit: eventos de seguridad y trazabilidad.
- common: guards, filtros, interceptores, utils.
- payments: integracion con PayPal y payouts.
- routes/bookings/ratings/drivers/vehicle/business: dominio del carpooling.

## STRIDE - Riesgos y mitigaciones
### Spoofing
- JWE cifrados con issuer/audience.
- Guardia JWE valida firma, exp y revocacion.

### Tampering
- AES-256-GCM en identity para detectar modificaciones.
- Validacion estricta de payloads con class-validator.

### Repudiation
- Auditoria de eventos criticos (login, logout, reset, accesos denegados).
- Registro de IP y user-agent.

### Information Disclosure
- Schemas desacoplados con mapeo cifrado.
- Tokens usan businessUserId, no authUserId.
- CORS restringido por origen.

### Denial of Service
- Rate limiting global (throttler).
- Limites de intentos y reenvios en OTP y reset.

### Elevation of Privilege
- RolesGuard valida roles por endpoint.
- Validaciones en servicios antes de operaciones sensibles.

## Tecnologias y controles de seguridad
- JWE (jose) para tokens cifrados.
- bcrypt para hashing de contrasenas.
- Redis para revocacion y limites.
- AES-256-GCM + HMAC-SHA256 en Identity.
- Helmet, CORS y ValidationPipe global.
- Auditoria y logging estructurado.

## Estado actual (implementado)
- Documentacion tecnica con Compodoc y seccion de docs.
- Comentarios TSDoc en funciones clave de seguridad.
- Docs de arquitectura y seguridad en `docs/`.

## Referencias internas
- docs/overview.md
- docs/arquitectura.md
- docs/seguridad.md
