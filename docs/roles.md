# Roles (formato academico)

## Objetivo
Clarificar permisos y restricciones por rol segun controllers y guards.

## Alcance
Incluye roles USER, PASAJERO, CONDUCTOR y ADMIN con transiciones.

Descripcion: Resume permisos y restricciones por rol, basados en controllers/guards actuales.

## R-001 Visitante
Puede:
1. Registro, login, forgot-password, reset-password.
2. Health check.

Restricciones:
1. Sin acceso a rutas, reservas ni pagos.

## R-002 USER (no verificado)
Puede:
1. Enviar y confirmar verificacion de correo.
2. Buscar rutas disponibles (routes/available).

Restricciones:
1. No puede reservar ni crear rutas.
2. No puede acceder a pagos ni ratings.

## R-003 PASAJERO
Puede:
1. Buscar rutas y ver detalle de rutas.
2. Reservar asientos y cancelar reservas.
3. Crear pagos (PayPal/Tarjeta) o reservar en efectivo.
4. Solicitar ser conductor.
5. Subir documentos de conductor (LICENCIA, MATRICULA).
6. Ver y usar OTP de viaje.
7. Calificar usuarios dentro de 24 horas.

Restricciones:
1. No puede crear rutas.
2. Bloqueo si rating < 3.

## R-004 CONDUCTOR
Puede:
1. Crear y gestionar rutas.
2. Subir documentos de conductor.
3. Registrar y actualizar vehiculos.
4. Validar OTP y marcar NO_SHOW.
5. Finalizar rutas.
6. Ver pagos/payouts propios.

Restricciones:
1. Bloqueo si rating < 3.
2. Actualizar vehiculo vuelve el estado a PENDIENTE hasta nueva aprobacion.

## R-005 ADMIN
Puede:
1. Aprobar/rechazar documentos y solicitudes de conductor.
2. Cambiar roles.
3. Generar payouts por periodo.
4. Ver transacciones y rutas globales.

Restricciones:
1. Acciones auditadas.

## R-006 Transicion de roles
1. Visitante -> USER: registro.
2. USER -> PASAJERO: verificacion de correo.
3. PASAJERO -> CONDUCTOR: aprobacion de solicitud.
4. ADMIN: asignacion por administrador.
