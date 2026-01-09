# Seguridad WasiGo Backend

Esta guia documenta los controles de seguridad implementados en el backend.

## Autenticacion y autorizacion
- JWE (tokens cifrados) para access y refresh tokens.
- Guardia JWE valida issuer, audience, expiracion y revocacion en Redis.
- Guardia de roles limita accesos por perfil.
- Los tokens usan `businessUserId` y no `authUserId` para evitar correlacion.

## Identidad desacoplada (auth/business)
- UUIDs separados para auth y business.
- Mapeo cifrado con AES-256-GCM en tabla `audit.user_identity_map`.
- Hash deterministico con HMAC-SHA256 para correlacion sin exponer UUIDs.
- Sin emails en `business` para reducir identificacion directa.

## Proteccion de sesiones y revocacion
- Revocacion por jti y por usuario en Redis.
- Rotacion de refresh tokens con invalidacion del token anterior.
- TTLs configurables para revocacion y reset.
- Limpieza de sesiones ante cambio o reset de contrasena.

## Passwords y recuperacion
- Hash de contrasenas con bcrypt (factor 12).
- Reset con token de un solo uso almacenado en Redis.
- Limites de intentos y ventana de reintentos para reset.
- Mensajes genericos en produccion para evitar enumeracion.

## OTP
- OTP de 6 digitos con TTL.
- Limites de intentos y reenvios por usuario.
- Comparacion en tiempo constante para evitar timing attacks.

## Endurecimiento de API
- Helmet para headers de seguridad.
- CORS restringido por origen.
- Validacion estricta (whitelist + forbidNonWhitelisted).
- Rate limiting global con @nestjs/throttler.
- Validacion de tokens y payloads antes de llegar a servicios.

## Auditoria y logging
- Auditoria de eventos criticos (login, logout, reset, accesos denegados).
- Logger estructurado para eventos de seguridad y trazabilidad.
- Registro de IP y user-agent para acciones sensibles.

## Manejo de errores
- Respuestas estandarizadas y controladas en produccion.
- Detalle extendido solo en desarrollo.

## Recomendaciones operativas
- Mantener secretos fuera del repo (KMS o secret manager).
- Rotar claves JWT y de identidad periodicamente.
- Limitar acceso a Redis y Postgres por red privada.
- Activar TLS en conexiones externas.

## Configuracion relevante
- JWT_SECRET: 32 caracteres exactos.
- IDENTITY_ENCRYPTION_KEY: 64 hex (32 bytes).
- IDENTITY_HASH_SECRET: minimo 32 caracteres.
- MAX_FAILED_ATTEMPTS y BLOCK_TIME_MINUTES para control de fuerza bruta.

## Archivos clave
- src/main.ts (helmet, CORS, validacion global, Swagger controlado).
- src/app.module.ts (throttling global, SSL DB).
- src/modules/auth/Guards/jwe-auth.guard.ts (validacion JWE).
- src/modules/auth/Guards/roles.guard.ts (roles).
- src/modules/auth/auth.service.ts (login, tokens, reset, sesiones).
- src/modules/identity/identity-hash.service.ts (AES-256-GCM, HMAC).
- src/modules/identity/identity-resolver.service.ts (mapeo seguro).
- src/redis/redis.service.ts (revocacion y OTP).
- src/modules/otp/otp.service.ts (OTP, limites).
- src/modules/common/filters/global-exception.filter.ts (auditoria 401/403).

## Generar documentacion tecnica

```bash
# Generar documentacion estatica
npm run docs:build

# Servir documentacion local
npm run docs:serve
```

La salida se genera en la carpeta `documentation/`.
