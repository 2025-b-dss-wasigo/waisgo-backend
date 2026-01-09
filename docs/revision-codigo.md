# Checklist de revision de codigo

## Objetivo
Guiar a un revisor hacia la evidencia tecnica en el codigo.

## Alcance
Aplica a seguridad, reglas operativas y modulos criticos.

Descripcion: Lista corta de archivos para ubicar evidencia de seguridad y reglas en el codigo.

## Configuracion global
- `src/main.ts`: helmet, CORS, ValidationPipe, Swagger.
- `src/app.module.ts`: throttling global, DB SSL.
- `src/config/env.schema.ts`: limites y variables de seguridad.

## Autenticacion y sesiones
- `src/modules/auth/auth.service.ts`: login, JWE, reset, bloqueo por intentos.
- `src/modules/auth/Guards/jwe-auth.guard.ts`: validacion token y revocacion.
- `src/modules/auth/Guards/roles.guard.ts`: control por roles.
- `src/redis/redis.service.ts`: revocacion por jti y por usuario.

## Identidad y privacidad
- `src/modules/identity/identity-hash.service.ts`: HMAC/AES-256-GCM.
- `src/modules/identity/identity-resolver.service.ts`: mapeo cifrado.
- `src/modules/identity/user-identity-map.entity.ts`: tabla de mapeo.

## OTP y verificacion
- `src/modules/otp/otp.service.ts`: OTP verificacion, limites.
- `src/modules/verification/verification.service.ts`: envio y confirmacion.
- `src/modules/bookings/bookings.service.ts`: OTP de viaje y validacion.

## Reglas operativas clave
- `src/modules/bookings/bookings.service.ts`: cancelacion, no-show, reembolso.
- `src/modules/routes/routes.service.ts`: cancelacion tardia, penalizacion.
- `src/modules/ratings/ratings.service.ts`: ventana 24h y bloqueo por rating.
- `src/modules/drivers/drivers.service.ts`: solicitud conductor y cooldown.
- `src/modules/vehicle/vehicle.service.ts`: actualizacion y re-aprobacion.

## Auditoria y errores
- `src/modules/audit/audit.service.ts`: registro de eventos.
- `src/modules/common/filters/global-exception.filter.ts`: auditoria 401/403.

## Pagos y payouts
- `src/modules/payments/payments.service.ts`: pagos y reversiones.
- `src/modules/payments/payouts/payouts.service.ts`: generacion de payouts.
