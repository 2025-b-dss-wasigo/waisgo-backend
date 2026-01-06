// Constantes de mensajes de error para toda la aplicación
// Usados en servicios, controllers, filters e interceptors

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
    ACCOUNT_CREATE: 'Cuenta creada exitosamente',

    // Contraseña
    INVALID_CURRENT_PASSWORD: 'La contraseña actual es incorrecta',
    PASSWORD_SAME_AS_OLD: 'La nueva contraseña debe ser diferente a la actual',
    PASSWORD_REQUIREMENTS:
      'La contraseña debe tener 7-20 caracteres, mayúsculas, minúsculas, números y un carácter especial',
    PASSWORDS_DO_NOT_MATCH: 'Las contraseñas no coinciden',

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
    CODE_INVALID_OR_EXPIRED: 'Código inválido o expirado',
  },

  // ============ USER ============
  USER: {
    NOT_FOUND: 'Usuario no encontrado',
    NOT_VERIFIED: 'Debes verificar tu cuenta primero',
    PROFILE_UPDATED: 'Perfil actualizado correctamente',
    PROFILE_PHOTO_UPDATED: 'Foto de perfil actualizada correctamente',
    PROFILE_NOT_FOUND: 'Perfil no encontrado',
    EMAIL_CHANGE_LOCKED:
      'No puedes cambiar el correo una vez que la cuenta está verificada',
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
    NO_DRIVER_REQUEST: 'No tienes una solicitud de conductor activa',
    DRIVER_NOT_FOUND: 'Conductor no encontrado',
    DRIVER_NOT_APPROVED: 'Tu solicitud de conductor no está aprobada',
    NOT_A_DRIVER: 'No eres un conductor registrado',
    VEHICLE_BRAND_LENGTH: 'La marca debe tener entre 2 y 15 caracteres',
    VEHICLE_MODEL_LENGTH: 'El modelo debe tener entre 2 y 15 caracteres',
    VEHICLE_COLOR_LENGTH: 'El color debe tener entre 3 y 10 caracteres',
    VEHICLE_NOT_FOUND: 'Vehículo no encontrado',
    VEHICLE_CREATED: 'Vehículo registrado correctamente',
    VEHICLE_UPDATED: 'Vehículo actualizado correctamente',
    VEHICLE_DISABLED: 'Vehículo desactivado correctamente',
    VEHICLE_REACTIVATED: 'Vehículo reactivado correctamente',
    VEHICLE_REQUIRED:
      'Debes tener un vehículo activo para solicitar ser conductor',
    VEHICLE_ALREADY_ACTIVE: 'El vehículo ya está activo',
    VEHICLE_REACTIVATION_EXPIRED:
      'No se puede reactivar el vehículo. Han pasado más de 30 días desde su desactivación',
    PLATE_FORMAT: 'La placa debe tener 3 letras y 4 números (ej: ABC1234)',
    PLATE_ALREADY_EXISTS: 'Esta placa ya está registrada',
    SEATS_RANGE: 'Los asientos disponibles deben ser entre 1 y 6',
    FILE_REQUIRED: 'El archivo es requerido',
    FILE_TOO_LARGE: 'El archivo no puede superar 2 MB',
    INVALID_FILE_FORMAT: 'Solo se permiten archivos PNG, JPG o JPEG',
    FILE_VOID: 'El archivo está vacío o no se pudo leer',
    FILE_SIGNATURE: 'La firma del archivo no coincide con el tipo declarado',
    INVALID_PAYPAL: 'La cuenta de PayPal no es válida',
    PAYPAL_EMAIL_MAX_LENGTH: 'El email no puede superar 254 caracteres',
    DOCUMENT_UPLOADED: 'Documento subido correctamente',
    APPLICATION_SUBMITTED: 'Solicitud enviada correctamente',
    APPLICATION_RESUBMITTED: 'Solicitud reenviada correctamente',
    CANNOT_UPLOAD_WHEN_REJECTED:
      'No puedes subir documentos mientras tu solicitud esté rechazada. Debes volver a aplicar.',
    CANNOT_UPLOAD_WHEN_APPROVED:
      'No puedes modificar documentos después de ser aprobado como conductor.',
    CANNOT_UPLOAD_DOCUMENTS:
      'No puedes subir documentos en el estado actual de tu solicitud.',
  },

  // ============ ROUTES (RN-011, RN-012) ============
  ROUTES: {
    ROUTE_CREATED: 'Ruta creada correctamente',
    ROUTES_LIST_DRIVER: 'Listado de rutas creadas por el conductor',
    ROUTES_LIST_AVAILABLE:
      'Listado de rutas activas cercanas al pasajero segun ubicacion',
    ROUTE_DETAIL: 'Detalle de la ruta solicitada',
    ROUTE_MAP: 'Coordenadas de la ruta para visualizacion en el mapa',
    ROUTE_STOP_ADDED: 'Parada agregada a la ruta y trayecto recalculado',
    ROUTE_CANCELLED: 'Ruta cancelada correctamente',
    ROUTE_FINALIZED: 'Ruta finalizada. Ya no esta disponible para pasajeros',
    ROUTE_NOT_ACTIVE: 'La ruta no esta activa',
    ROUTE_NOT_FINISHED: 'La ruta aun no ha finalizado',
    ROUTE_PRICE_REQUIRED: 'La ruta no tiene precio configurado',
    NO_ACTIVE_VEHICLE: 'Debes tener un vehiculo activo para crear rutas',
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
    BOOKING_NOT_ACTIVE: 'La reserva no esta activa',
    BOOKING_CREATED: 'Reserva creada correctamente',
    BOOKINGS_LIST: 'Listado de reservas del pasajero',
    BOOKING_DETAIL: 'Detalle de la reserva',
    BOOKING_MAP: 'Mapa de la reserva',
    BOOKINGS_ROUTE_LIST: 'Listado de pasajeros confirmados en la ruta',
    BOOKING_COMPLETED: 'Pasajero marcado como llegado',
    BOOKING_NO_SHOW: 'Pasajero marcado como NO_SHOW',
    NO_SHOW_TOO_EARLY: 'Aun no han pasado 30 minutos desde la hora de salida',
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
    OTP_FORMAT_INVALID: 'El OTP debe ser de 6 d¡gitos num‚ricos',
    OTP_ALREADY_USED: 'Este código OTP ya fue utilizado',
    TRIP_STARTED: 'Viaje iniciado correctamente',
    NO_SHOW_REPORTED: 'No show reportado. Se procesará el cobro parcial',
  },

  // ============ PAYMENTS (RN-017, RN-018, RN-019) ============
  PAYMENTS: {
    PAYMENT_NOT_FOUND: 'Pago no encontrado',
    PAYMENT_INITIATED: 'Pago iniciado correctamente',
    PAYMENT_DETAIL: 'Detalle del pago',
    PAYMENTS_LIST: 'Listado de pagos del pasajero',
    DRIVER_PAYMENTS_LIST: 'Pagos recibidos por el conductor',
    PAYMENTS_LIST_ADMIN: 'Listado global de pagos',
    PAYPAL_ORDER_CREATED: 'Orden PayPal creada correctamente',
    PAYPAL_CAPTURED: 'Pago PayPal capturado correctamente',
    PAYMENT_REVERSED: 'Pago revertido correctamente',
    PAYMENT_ALREADY_EXISTS: 'Ya existe un pago para esta reserva',
    PAYMENT_NOT_PENDING: 'El pago no esta en estado pendiente',
    PAYMENT_NOT_PAID: 'El pago no esta en estado pagado',
    PAYMENT_FAILED: 'Error al procesar el pago',
    PAYMENT_SUCCESS: 'Pago procesado correctamente',
    REFUND_PROCESSING: 'Reembolso en proceso (24-48 horas)',
    INSUFFICIENT_FUNDS: 'Fondos insuficientes',
    INVALID_PAYMENT_METHOD: 'Método de pago no válido',
    MIN_WITHDRAWAL: 'El monto mínimo para retiro es $5 USD',
    INVALID_PAYPAL_ACCOUNT:
      'Tu cuenta de PayPal no es válida. Actualízala en tu perfil',
  },

  // ============ PAYOUTS (RN-020, RN-021, RN-022) ============
  PAYOUTS: {
    PAYOUTS_LIST: 'Historial de pagos al conductor',
    PAYOUT_DETAIL: 'Detalle del payout',
    PAYOUTS_GENERATED: 'Payouts generados para el periodo',
    PAYOUT_SENT: 'Payout enviado por PayPal correctamente',
    PAYOUT_FAILED: 'Payout marcado como fallido',
    PAYOUTS_LIST_ADMIN: 'Listado global de payouts',
    PAYOUT_NOT_FOUND: 'Payout no encontrado',
    PAYOUT_NOT_PENDING: 'El payout no esta en estado pendiente',
    INVALID_PERIOD: 'El periodo debe estar en formato YYYY-MM',
  },

  // ============ RATINGS (RN-027, RN-028, RN-029) ============
  RATINGS: {
    ROUTE_NOT_COMPLETED: 'La ruta aun no esta finalizada',
    NOT_PARTICIPANT: 'No participaste en esta ruta',
    RATINGS_LIST_RECEIVED: 'Listado de calificaciones recibidas',
    RATINGS_LIST_GIVEN: 'Listado de calificaciones realizadas',
    RATINGS_SUMMARY: 'Resumen de rating del usuario',
    RATINGS_LIST_ADMIN: 'Listado global de calificaciones',
    LOW_RATED_USERS: 'Usuarios con rating bajo',
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
    DRIVER_SUSPENDED: 'Conductor suspendido correctamente',
    DRIVER_REQUEST_NOT_FOUND: 'Solicitud de conductor no encontrada',
    ONLY_PENDING_CAN_APPROVE: 'Solo se pueden aprobar solicitudes pendientes',
    ONLY_PENDING_CAN_REJECT: 'Solo se pueden rechazar solicitudes pendientes',
    ONLY_APPROVED_CAN_SUSPEND: 'Solo se pueden suspender conductores aprobados',
    ALL_DOCUMENTS_REQUIRED:
      'Todos los documentos deben estar aprobados antes de aprobar al conductor',
    DOCUMENT_NOT_FOUND: 'Documento no encontrado',
    DOCUMENT_APPROVED: 'Documento aprobado correctamente',
    DOCUMENT_REJECTED: 'Documento rechazado',
    REJECTION_REASON_REQUIRED: 'Debes indicar el motivo del rechazo',
    REJECTION_REASON_MIN_LENGTH: 'El motivo debe tener minimo 10 caracteres',
    REJECTION_REASON_MAX_LENGTH: 'El motivo debe tener maximo 500 caracteres',
    ROLE_UPDATED: 'Rol de usuario actualizado',
    ACTION_LOGGED: 'Acción registrada en auditoría',
    SEED_ALREADY_RUN: 'La semilla ya fue ejecutada previamente',
    SEED_COMPLETED: 'Semilla creada correctamente',
  },

  // ============ GENERIC / SYSTEM ============
  SYSTEM: {
    INTERNAL_ERROR: 'Error interno del servidor',
    UNAUTHORIZED: 'No tienes autorización para esta acción',
    FORBIDDEN: 'Acceso denegado',
    NOT_FOUND: 'Recurso no encontrado',
    TOO_MANY_REQUESTS: 'Demasiadas solicitudes. Intenta más tarde',
    INVALID_TOKEN: 'Token inválido o expirado',
    TOKEN_REQUIRED: 'Token requerido',
    TOKEN_MALFORMED: 'Token malformado',
    TOKEN_EXPIRED: 'Token expirado',
    TOKEN_REVOKED: 'Token revocado',
    ROLE_NOT_IDENTIFIED: 'Rol no identificado',
    ACCESS_DENIED_ROLE: 'Acceso denegado para su rol',
    ALIAS_GENERATION_FAILED:
      'No se pudo generar un alias único. Intenta nuevamente en unos minutos',
    SESSION_EXPIRED: 'Tu sesión ha expirado. Inicia sesión nuevamente',
  },

  // ============ STORAGE ============
  STORAGE: {
    UPLOAD_FAILED: 'Error al subir el archivo',
  },

  // ============ MAIL ============
  MAIL: {
    SEND_FAILED:
      'Error al enviar el correo electr¢nico. Por favor intente m s tarde.',
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

  // ============ STORAGE ============
  STORAGE: {
    UPLOAD_FAILED: 'Error al subir el archivo',
  },

  // ============ MAIL ============
  MAIL: {
    SEND_FAILED:
      'Error al enviar el correo electr¢nico. Por favor intente m s tarde.',
  },
} as const;
