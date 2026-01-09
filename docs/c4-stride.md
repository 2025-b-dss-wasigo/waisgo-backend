# C4 y STRIDE

## Objetivo
Apoyar el analisis C4/STRIDE con contexto, contenedores y mitigaciones.

## Alcance
Se enfoca en la arquitectura y amenazas relevantes del backend y sus dependencias.

Descripcion: Documento de apoyo para el analisis arquitectonico (C4) y de amenazas
(STRIDE). Resume el contexto, contenedores, componentes y mitigaciones.

## C4 - Contexto
- Usuarios finales: pasajeros, conductores y administradores.
- Sistema principal: WasiGo Backend (API).
- Sistemas externos: PayPal, MinIO u OCI Object Storage, correo SMTP.
- Infraestructura: PostgreSQL, Redis.

## C4 - Contenedores
- API (NestJS): expone endpoints REST, aplica auth y validaciones.
- Base de datos (PostgreSQL): datos en schemas auth, business y audit.
- Cache y sesiones (Redis): revocacion de tokens, OTP y limites.
- Almacenamiento (MinIO/OCI): documentos y recursos externos.
- Notificaciones (SMTP): verificacion y reset de contrasena.

## C4 - Componentes (backend)
- auth: login, register, reset, refresh y logout.
- identity: mapeo cifrado entre auth y business.
- audit: eventos de seguridad y trazabilidad.
- common: guards, filtros, interceptores, utils.
- payments: integracion con PayPal y payouts.
- routes/bookings/ratings/drivers/vehicle/business: dominio de carpooling.

## STRIDE - Riesgos y mitigaciones
### Spoofing
- JWE cifrados con issuer/audience.
- Guardia JWE valida exp y revocacion.

### Tampering
- AES-256-GCM en identity para detectar modificaciones.
- Validacion estricta con class-validator.

### Repudiation
- Auditoria de eventos criticos.
- Registro de IP y user-agent.

### Information Disclosure
- Schemas desacoplados con mapeo cifrado.
- Tokens usan businessUserId.
- CORS restringido por origen.

### Denial of Service
- Rate limiting global.
- Limites de intentos en OTP y reset.

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
