/**
 * Acciones de auditoría para WasiGo
 * Basadas en las Reglas de Negocio V0.2.0
 *
 * Estas acciones se registran en la tabla audit_logs
 * y serán visualizadas en Grafana mediante SQL DataSource
 */
export enum AuditAction {
  // ============ AUTH ============
  /** Usuario se registró en el sistema */
  REGISTER = 'REGISTER',
  /** Login exitoso */
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  /** Login fallido (credenciales incorrectas) */
  LOGIN_FAILED = 'LOGIN_FAILED',
  /** Usuario cerró sesión */
  LOGOUT = 'LOGOUT',
  /** Cuenta bloqueada por intentos fallidos */
  ACCOUNT_BLOCKED = 'ACCOUNT_BLOCKED',
  /** Cuenta desbloqueada */
  ACCOUNT_UNBLOCKED = 'ACCOUNT_UNBLOCKED',

  // ============ CONTRASEÑA ============
  /** Usuario solicitó reset de contraseña */
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  /** Usuario completó reset de contraseña */
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  /** Usuario cambió su contraseña */
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  /** Intento fallido de cambiar contraseña */
  PASSWORD_CHANGE_FAILED = 'PASSWORD_CHANGE_FAILED',

  // ============ VERIFICACIÓN DE CUENTA (RN-005, RN-006) ============
  /** Código de verificación enviado */
  VERIFICATION_CODE_SENT = 'VERIFICATION_CODE_SENT',
  /** Código de verificación reenviado */
  VERIFICATION_CODE_RESENT = 'VERIFICATION_CODE_RESENT',
  /** Verificación de cuenta exitosa */
  VERIFICATION_SUCCESS = 'VERIFICATION_SUCCESS',
  /** Verificación de cuenta fallida */
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',

  // ============ PERFIL ============
  /** Usuario actualizó su perfil */
  PROFILE_UPDATE = 'PROFILE_UPDATE',
  /** Usuario actualizó su foto de perfil */
  PROFILE_PHOTO_UPDATE = 'PROFILE_PHOTO_UPDATE',
  /** Cuenta desactivada/eliminada */
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',

  // ============ CONDUCTOR (RN-007, RN-008, RN-009) ============
  /** Solicitud de conductor enviada */
  DRIVER_APPLICATION_SUBMITTED = 'DRIVER_APPLICATION_SUBMITTED',
  /** Solicitud de conductor aprobada */
  DRIVER_APPLICATION_APPROVED = 'DRIVER_APPLICATION_APPROVED',
  /** Solicitud de conductor rechazada */
  DRIVER_APPLICATION_REJECTED = 'DRIVER_APPLICATION_REJECTED',
  /** Conductor actualizó datos del vehículo */
  DRIVER_VEHICLE_UPDATE = 'DRIVER_VEHICLE_UPDATE',

  // ============ RUTAS (RN-011, RN-012, RN-013) ============
  /** Ruta creada por conductor */
  ROUTE_CREATED = 'ROUTE_CREATED',
  /** Ruta actualizada */
  ROUTE_UPDATED = 'ROUTE_UPDATED',
  /** Ruta cancelada por conductor */
  ROUTE_CANCELLED_DRIVER = 'ROUTE_CANCELLED_DRIVER',
  /** Viaje iniciado */
  ROUTE_STARTED = 'ROUTE_STARTED',
  /** Viaje completado */
  ROUTE_COMPLETED = 'ROUTE_COMPLETED',

  // ============ RESERVAS (RN-014, RN-015) ============
  /** Reserva creada por pasajero */
  BOOKING_CREATED = 'BOOKING_CREATED',
  /** Reserva cancelada por pasajero */
  BOOKING_CANCELLED_PASSENGER = 'BOOKING_CANCELLED_PASSENGER',
  /** No show del pasajero */
  BOOKING_NO_SHOW = 'BOOKING_NO_SHOW',
  /** Conductor ausente reportado */
  BOOKING_DRIVER_ABSENT = 'BOOKING_DRIVER_ABSENT',

  // ============ OTP DE VIAJE (RN-023, RN-024) ============
  /** Código OTP de viaje generado */
  TRIP_OTP_GENERATED = 'TRIP_OTP_GENERATED',
  /** Código OTP de viaje validado */
  TRIP_OTP_VALIDATED = 'TRIP_OTP_VALIDATED',
  /** Código OTP de viaje inválido */
  TRIP_OTP_INVALID = 'TRIP_OTP_INVALID',

  // ============ PAGOS (RN-017, RN-018, RN-019) ============
  /** Pago iniciado */
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  /** Pago completado exitosamente */
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  /** Pago fallido */
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  /** Reembolso procesado */
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',

  // ============ RETIROS (RN-020, RN-021, RN-022) ============
  /** Retiro de fondos solicitado */
  WITHDRAWAL_REQUESTED = 'WITHDRAWAL_REQUESTED',
  /** Retiro de fondos completado */
  WITHDRAWAL_COMPLETED = 'WITHDRAWAL_COMPLETED',
  /** Retiro de fondos fallido */
  WITHDRAWAL_FAILED = 'WITHDRAWAL_FAILED',

  // ============ CALIFICACIONES (RN-027, RN-028, RN-029) ============
  /** Calificación dada */
  RATING_GIVEN = 'RATING_GIVEN',
  /** Usuario bloqueado por baja calificación */
  RATING_USER_BLOCKED = 'RATING_USER_BLOCKED',

  // ============ SEGURIDAD ============
  /** Acceso no autorizado (401) */
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  /** Acceso denegado por rol (403) */
  ACCESS_DENIED_ROLE = 'ACCESS_DENIED_ROLE',
  /** Actividad sospechosa detectada */
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  /** Token inválido o expirado */
  TOKEN_INVALID = 'TOKEN_INVALID',

  // ============ ADMIN (RN-030, RN-031) ============
  /** Admin cambió rol de usuario */
  ADMIN_ROLE_CHANGE = 'ADMIN_ROLE_CHANGE',
  /** Admin suspendió usuario */
  ADMIN_USER_SUSPENSION = 'ADMIN_USER_SUSPENSION',
  /** Admin cambió configuración del sistema */
  ADMIN_CONFIG_CHANGE = 'ADMIN_CONFIG_CHANGE',
  /** Admin creó otro admin */
  ADMIN_CREATED = 'ADMIN_CREATED',

  // ============ EMAIL ============
  /** Email enviado exitosamente */
  EMAIL_SENT = 'EMAIL_SENT',
  /** Error al enviar email */
  EMAIL_FAILED = 'EMAIL_FAILED',
}
