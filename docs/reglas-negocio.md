# Reglas de negocio (alineadas al codigo)

Este documento refleja las reglas implementadas en el codigo actual.
Los valores marcados como "configurable" provienen de variables de entorno.

## Registro y autenticacion
- Correo: dominio @epn.edu.ec, max 30, unico.
- Nombre/Apellido: 3-15 caracteres, solo letras y espacios.
- Celular: formato 09XXXXXXXX (10 digitos).
- Contrasena: 7-20 caracteres, incluye mayuscula, minuscula, numero y especial.
- Alias automatico: Pasajero#### (4 digitos), unico.

## Verificacion de cuenta
- OTP de 6 digitos.
- Expiracion: 15 minutos (configurable: OTP_EXPIRATION_MINUTES).
- Max intentos: 3 (configurable: MAX_OTP_ATTEMPTS).
- Max reenvios: 3 (configurable: MAX_OTP_RESENDS).
- Solo rol USER puede enviar/confirmar verificacion.
- Al verificar, el rol pasa de USER a PASAJERO.

## Limpieza de cuentas no verificadas
- Cron diario 02:00.
- Elimina usuarios no verificados con antiguedad > 3 dias
  (configurable: CLEANUP_UNVERIFIED_DAYS).

## Login y bloqueo temporal
- Bloqueo por intentos fallidos: 5 (configurable: MAX_FAILED_ATTEMPTS).
- Tiempo de bloqueo: 15 minutos (configurable: BLOCK_TIME_MINUTES).

## Recuperacion de contrasena
- Token de reset con TTL 30 min (configurable: RESET_TOKEN_EXPIRY_MINUTES).
- Max intentos de reset: 3 (configurable: MAX_RESET_ATTEMPTS).
- Solo un token activo por usuario; el anterior se revoca.

## Solicitud de conductor
- Solo PASAJERO puede solicitar.
- Requiere email de PayPal valido.
- Reintento tras rechazo: 7 dias (REJECTION_COOLDOWN_DAYS).

## Documentos de conductor
- Tipos: LICENCIA y MATRICULA.
- Tamaño maximo: 2 MB.
- Formatos: jpg, png, pdf (se valida firma del archivo).
- Solo se aceptan en estado PENDIENTE.

## Vehiculos
- Marca/Modelo: 2-15.
- Color: 3-10.
- Placa: 3 letras + 4 digitos (ABC1234), unica.
- Asientos disponibles: 1-6.
- Actualizar vehiculo vuelve el estado del conductor a PENDIENTE y el alias a Pasajero####.

## Rutas
- Solo CONDUCTOR aprobado puede crear rutas.
- Origen: campus enum.
- Fecha: YYYY-MM-DD. Hora: HH:mm.
- Destino base max 255.
- Asientos totales: 1-8.
- Precio por pasajero >= 0.1.
- Stops: minimo 1, con lat/lng y direccion.
- Busqueda: radio default 1 km (radiusKm 0.1-10).

## Reservas y pagos
- PASAJERO con rating < 3 o bloqueado no puede reservar.
- Si tiene NO_SHOW en efectivo, no puede reservar.
- Metodos: EFECTIVO, PAYPAL, TARJETA.
- Pago digital se inicia desde Payments; efectivo no crea pago.

## Cancelacion de reserva
- Reembolso si se cancela >= 1 hora antes de la salida.
- Si es tarde (< 1 hora), no hay reembolso.

## No-show
- Conductor puede marcar NO_SHOW despues de 30 min de la salida.
- La reserva pasa a NO_SHOW y bloquea nuevas reservas en efectivo.
- Si el pago estaba PENDING, se marca FAILED.

## Cancelacion de ruta (conductor)
- Si cancela dentro de 2 horas: penalizacion de -1 al rating.
- Se cancelan reservas y se intentan reembolsos de pagos.

## OTP de viaje
- OTP de 6 digitos, cifrado en BD.
- Visible hasta 2 horas despues de la salida para CONFIRMADA/COMPLETADA.
- Al validar, se marca como usado.

## Calificaciones
- Puntaje 1 a 5.
- Ventana de calificacion: 24 horas tras finalizar la ruta.
- Promedio < 3 bloquea al usuario (isBloqueadoPorRating).

## Payouts
- Generacion por periodo (YYYY-MM) desde pagos PAID sin payout.
- Crea payout PENDING por conductor.

## Perfil de usuario
- Editable: nombre, apellido, celular.
- No editable: alias y correo.

Ultima actualizacion: 2026-01
