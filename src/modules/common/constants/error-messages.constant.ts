/**
 * Mensajes de error estandarizados para WasiGo
 * Basados en las Reglas de Negocio V0.2.0
 *
 * Formato: Mensajes claros, concisos y específicos para el frontend
 */

export const ErrorMessages = {
  // ============ AUTH ============
  AUTH: {
    // Login
    INVALID_CREDENTIALS: 'Correo o contraseña incorrectos',
    ACCOUNT_BLOCKED: (minutes: number) =>
      `Cuenta bloqueada temporalmente. Intenta en ${minutes} minutos`,

    // Registro (RN-001)
    EMAIL_ALREADY_EXISTS: 'Este correo ya está registrado',
    EMAIL_NOT_FOUND: 'No existe una cuenta con este correo',
    INVALID_EMAIL_DOMAIN: 'El correo debe ser @epn.edu.ec',

    // Contraseña
    INVALID_CURRENT_PASSWORD: 'La contraseña actual es incorrecta',
    PASSWORD_SAME_AS_OLD: 'La nueva contraseña debe ser diferente a la actual',
    PASSWORD_REQUIREMENTS:
      'La contraseña debe tener 7-20 caracteres, mayúsculas, minúsculas, números y un carácter especial',

    // Reset password
    RESET_TOKEN_INVALID: 'El enlace es inválido o ha expirado',
    RESET_LIMIT_EXCEEDED:
      'Has excedido el límite de solicitudes. Intenta en 1 hora',
    RESET_EMAIL_SENT:
      'Si el correo está registrado, recibirás las instrucciones',
    PASSWORD_RESET_SUCCESS: 'Contraseña restablecida correctamente',

    // Logout
    LOGOUT_SUCCESS: 'Sesión cerrada correctamente',
    PASSWORD_CHANGE_SUCCESS: 'Contraseña actualizada correctamente',
  },

  // ============ VERIFICATION (RN-005, RN-006) ============
  VERIFICATION: {
    ALREADY_VERIFIED: 'Tu cuenta ya está verificada',
    CODE_SENT: 'Código enviado al correo',
    CODE_EXPIRED: 'El código ha expirado. Solicita uno nuevo',
    CODE_INVALID: 'Código incorrecto',
    CODE_ATTEMPTS_LEFT: (remaining: number) =>
      `Código incorrecto. Intentos restantes: ${remaining}`,
    MAX_ATTEMPTS_REACHED: 'Demasiados intentos. Solicita un nuevo código',
    RESEND_LIMIT: 'Has alcanzado el límite de reenvíos (máximo 3)',
    VERIFICATION_SUCCESS: 'Cuenta verificada exitosamente',
    CODE_FORMAT_INVALID: 'El código debe ser de 6 dígitos',
  },

  // ============ USER ============
  USER: {
    NOT_FOUND: 'Usuario no encontrado',
    NOT_VERIFIED: 'Debes verificar tu cuenta primero',
    PROFILE_UPDATED: 'Perfil actualizado correctamente',
    PROFILE_NOT_FOUND: 'Perfil no encontrado',
  },

  // ============ VALIDATION (RN-001) ============
  VALIDATION: {
    REQUIRED_FIELD: (field: string) => `El campo ${field} es requerido`,
    INVALID_FORMAT: (field: string) => `Formato de ${field} inválido`,
    NAME_LENGTH: 'El nombre debe tener entre 3 y 15 caracteres',
    NAME_LETTERS_ONLY: 'El nombre solo puede contener letras',
    LASTNAME_LENGTH: 'El apellido debe tener entre 3 y 15 caracteres',
    LASTNAME_LETTERS_ONLY: 'El apellido solo puede contener letras',
    PHONE_FORMAT: 'El celular debe tener 10 dígitos y empezar con 09',
    EMAIL_MAX_LENGTH: 'El correo no puede superar 30 caracteres',
  },

  // ============ DRIVER REQUEST (RN-007, RN-008) ============
  DRIVER: {
    ONLY_PASSENGERS_CAN_REQUEST:
      'Solo usuarios verificados pueden solicitar ser conductor',
    REQUEST_PENDING: 'Ya tienes una solicitud en proceso',
    REQUEST_REJECTED_COOLDOWN:
      'Debes esperar 7 días después del rechazo para volver a solicitar',
    VEHICLE_BRAND_LENGTH: 'La marca debe tener entre 2 y 15 caracteres',
    VEHICLE_MODEL_LENGTH: 'El modelo debe tener entre 2 y 15 caracteres',
    VEHICLE_COLOR_LENGTH: 'El color debe tener entre 3 y 10 caracteres',
    PLATE_FORMAT: 'La placa debe tener 3 letras y 4 números (ej: ABC1234)',
    PLATE_ALREADY_EXISTS: 'Esta placa ya está registrada',
    SEATS_RANGE: 'Los asientos disponibles deben ser entre 1 y 6',
    FILE_TOO_LARGE: 'El archivo no puede superar 2 MB',
    INVALID_FILE_FORMAT: 'Solo se permiten archivos PNG, JPG o PDF',
    INVALID_PAYPAL: 'La cuenta de PayPal no es válida',
  },

  // ============ ROUTES (RN-011, RN-012) ============
  ROUTES: {
    ONLY_DRIVERS_CAN_CREATE: 'Solo conductores pueden crear rutas',
    DRIVER_BLOCKED_LOW_RATING:
      'No puedes crear rutas con calificación menor a 3.0',
    INVALID_DEPARTURE_LOCATION: 'Lugar de salida no válido',
    ROUTE_NOT_FOUND: 'Ruta no encontrada',
    ROUTE_FULL: 'No hay asientos disponibles',
    SEATS_EXCEED_VEHICLE:
      'Los asientos no pueden superar los registrados en tu vehículo',
  },

  // ============ BOOKINGS (RN-014, RN-015) ============
  BOOKINGS: {
    PASSENGER_BLOCKED_LOW_RATING:
      'No puedes reservar viajes con calificación menor a 3.0',
    PASSENGER_HAS_DEBT:
      'Tienes un pago pendiente. Debes saldarlo antes de reservar',
    BOOKING_NOT_FOUND: 'Reserva no encontrada',
    ALREADY_BOOKED: 'Ya tienes una reserva en esta ruta',
    CANCELLATION_TOO_LATE:
      'No se puede cancelar con menos de 1 hora de anticipación',
    CANCELLATION_SUCCESS: 'Reserva cancelada. Se procesará el reembolso',
    NO_REFUND: 'No aplica reembolso por cancelación tardía',
  },

  // ============ OTP VIAJE (RN-023, RN-024, RN-025) ============
  TRIP_OTP: {
    OTP_NOT_FOUND: 'No tienes un código OTP activo',
    OTP_EXPIRED: 'El código OTP ha expirado',
    OTP_INVALID: 'Código OTP incorrecto',
    OTP_ALREADY_USED: 'Este código OTP ya fue utilizado',
    TRIP_STARTED: 'Viaje iniciado correctamente',
    NO_SHOW_REPORTED: 'No show reportado. Se procesará el cobro parcial',
  },

  // ============ PAYMENTS (RN-017, RN-018, RN-019) ============
  PAYMENTS: {
    PAYMENT_FAILED: 'Error al procesar el pago',
    PAYMENT_SUCCESS: 'Pago procesado correctamente',
    REFUND_PROCESSING: 'Reembolso en proceso (24-48 horas)',
    INSUFFICIENT_FUNDS: 'Fondos insuficientes',
    INVALID_PAYMENT_METHOD: 'Método de pago no válido',
    MIN_WITHDRAWAL: 'El monto mínimo para retiro es $5 USD',
    INVALID_PAYPAL_ACCOUNT:
      'Tu cuenta de PayPal no es válida. Actualízala en tu perfil',
  },

  // ============ RATINGS (RN-027, RN-028, RN-029) ============
  RATINGS: {
    RATING_WINDOW_EXPIRED:
      'El período para calificar ha expirado (máximo 24 horas)',
    ALREADY_RATED: 'Ya calificaste este viaje',
    RATING_SUCCESS: 'Calificación registrada',
    INVALID_RATING: 'La calificación debe ser entre 1 y 5 estrellas',
  },

  // ============ ADMIN ============
  ADMIN: {
    DRIVER_APPROVED: 'Solicitud de conductor aprobada',
    DRIVER_REJECTED: 'Solicitud de conductor rechazada',
    REJECTION_REASON_REQUIRED: 'Debes indicar el motivo del rechazo',
    ROLE_UPDATED: 'Rol de usuario actualizado',
    ACTION_LOGGED: 'Acción registrada en auditoría',
  },

  // ============ GENERIC / SYSTEM ============
  SYSTEM: {
    INTERNAL_ERROR: 'Error interno del servidor',
    UNAUTHORIZED: 'No tienes autorización para esta acción',
    FORBIDDEN: 'Acceso denegado',
    NOT_FOUND: 'Recurso no encontrado',
    TOO_MANY_REQUESTS: 'Demasiadas solicitudes. Intenta más tarde',
    INVALID_TOKEN: 'Token inválido o expirado',
    SESSION_EXPIRED: 'Tu sesión ha expirado. Inicia sesión nuevamente',
  },
} as const;

// Códigos de error para el frontend (para manejar casos específicos)
export const ErrorCodes = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_ACCOUNT_BLOCKED: 'AUTH_002',
  AUTH_EMAIL_EXISTS: 'AUTH_003',
  AUTH_EMAIL_NOT_FOUND: 'AUTH_004',
  AUTH_RESET_LIMIT: 'AUTH_005',
  AUTH_TOKEN_INVALID: 'AUTH_006',

  // Verification
  VERIFY_ALREADY_DONE: 'VERIFY_001',
  VERIFY_CODE_EXPIRED: 'VERIFY_002',
  VERIFY_CODE_INVALID: 'VERIFY_003',
  VERIFY_MAX_ATTEMPTS: 'VERIFY_004',
  VERIFY_RESEND_LIMIT: 'VERIFY_005',

  // User
  USER_NOT_FOUND: 'USER_001',
  USER_NOT_VERIFIED: 'USER_002',

  // Driver
  DRIVER_NOT_ELIGIBLE: 'DRIVER_001',
  DRIVER_REQUEST_PENDING: 'DRIVER_002',
  DRIVER_COOLDOWN: 'DRIVER_003',

  // Routes
  ROUTE_NOT_FOUND: 'ROUTE_001',
  ROUTE_FULL: 'ROUTE_002',
  ROUTE_BLOCKED: 'ROUTE_003',

  // Bookings
  BOOKING_NOT_FOUND: 'BOOKING_001',
  BOOKING_BLOCKED: 'BOOKING_002',
  BOOKING_HAS_DEBT: 'BOOKING_003',
  BOOKING_CANCEL_LATE: 'BOOKING_004',

  // Payments
  PAYMENT_FAILED: 'PAYMENT_001',
  PAYMENT_INSUFFICIENT: 'PAYMENT_002',
  WITHDRAWAL_MIN: 'PAYMENT_003',

  // System
  SYSTEM_ERROR: 'SYS_001',
  UNAUTHORIZED: 'SYS_002',
  FORBIDDEN: 'SYS_003',
  RATE_LIMIT: 'SYS_004',
  VALIDATION_ERROR: 'SYS_005',
} as const;
