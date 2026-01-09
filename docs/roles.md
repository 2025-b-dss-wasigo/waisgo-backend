# Roles (alineados al codigo)

## Visitante (no autenticado)
Puede:
- Registro, login, forgot-password, reset-password.
- Health check.

Restricciones:
- No puede acceder a rutas, reservas ni pagos.

## USER (registrado no verificado)
Puede:
- Enviar y confirmar verificacion de correo.
- Buscar rutas disponibles (routes/available).

Restricciones:
- No puede reservar ni crear rutas.
- No puede acceder a pagos ni ratings.

## PASAJERO
Puede:
- Buscar rutas y ver detalle de rutas.
- Reservar asientos y cancelar reservas.
- Crear pagos (PayPal/Tarjeta) o reservar en efectivo.
- Solicitar ser conductor.
- Subir documentos de conductor (LICENCIA, MATRICULA).
- Ver y usar OTP de viaje.
- Calificar usuarios dentro de la ventana de 24 horas.

Restricciones:
- No puede crear rutas.
- Bloqueo si rating < 3.

## CONDUCTOR
Puede:
- Crear y gestionar rutas.
- Subir documentos de conductor.
- Registrar y actualizar vehiculos.
- Validar OTP y marcar NO_SHOW.
- Finalizar rutas.
- Ver pagos/payouts propios.

Restricciones:
- Bloqueo si rating < 3.
- Actualizar vehiculo vuelve el estado a PENDIENTE hasta nueva aprobacion.

## ADMIN
Puede:
- Aprobar/rechazar documentos y solicitudes de conductor.
- Cambiar roles.
- Generar payouts por periodo.
- Ver transacciones y rutas globales.

Restricciones:
- Acciones quedan auditadas.

## Transicion de roles
- Visitante -> USER: registro.
- USER -> PASAJERO: verificacion de correo.
- PASAJERO -> CONDUCTOR: aprobacion de solicitud.
- ADMIN: asignacion por administrador.
