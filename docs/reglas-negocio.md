# Reglas de negocio (RN)

## Objetivo
Documentar reglas de negocio verificables y alineadas al codigo actual.

## Alcance
Incluye registro, verificacion, rutas, reservas, pagos, OTP, ratings y payouts.

Descripcion: Documento en formato academico con reglas numeradas y tablas, alineado al codigo actual.

## RN-001 Registro de usuario
| Campo | Regla |
| --- | --- |
| Email | Dominio @epn.edu.ec, max 30, unico |
| Nombre | 3-15 caracteres, solo letras/espacios |
| Apellido | 3-15 caracteres, solo letras/espacios |
| Celular | 10 digitos, formato 09XXXXXXXX |
| Contrasena | 7-20 caracteres, incluye mayuscula, minuscula, numero y especial |

## RN-002 Alias automatico
| Regla | Detalle |
| --- | --- |
| Alias | Se genera automaticamente como Pasajero#### |
| Unicidad | El alias debe ser unico |

## RN-003 Verificacion por OTP
| Regla | Detalle |
| --- | --- |
| OTP | 6 digitos |
| Expiracion | 15 minutos (configurable: OTP_EXPIRATION_MINUTES) |
| Intentos | Max 3 (configurable: MAX_OTP_ATTEMPTS) |
| Reenvios | Max 3 (configurable: MAX_OTP_RESENDS) |
| Rol | Solo USER puede enviar/confirmar verificacion |
| Transicion | USER -> PASAJERO tras verificar |

## RN-004 Limpieza de no verificados
| Regla | Detalle |
| --- | --- |
| Cron | Diario 02:00 |
| Dias | 3 dias (configurable: CLEANUP_UNVERIFIED_DAYS) |

## RN-005 Login y bloqueo
| Regla | Detalle |
| --- | --- |
| Intentos fallidos | 5 (configurable: MAX_FAILED_ATTEMPTS) |
| Bloqueo | 15 minutos (configurable: BLOCK_TIME_MINUTES) |

## RN-006 Recuperacion de contrasena
| Regla | Detalle |
| --- | --- |
| Token reset | TTL 30 min (configurable: RESET_TOKEN_EXPIRY_MINUTES) |
| Intentos | Max 3 (configurable: MAX_RESET_ATTEMPTS) |
| Unicidad | Un token activo por usuario |

## RN-007 Solicitud de conductor
| Regla | Detalle |
| --- | --- |
| Rol | Solo PASAJERO puede solicitar |
| PayPal | Email valido |
| Reintento | 7 dias tras rechazo |

## RN-008 Documentos de conductor
| Regla | Detalle |
| --- | --- |
| Tipos | LICENCIA, MATRICULA |
| Tamano | Max 2 MB |
| Formatos | jpg, png, pdf (firma validada) |
| Estado | Solo PENDIENTE |

## RN-009 Vehiculos
| Campo | Regla |
| --- | --- |
| Marca/Modelo | 2-15 caracteres |
| Color | 3-10 caracteres |
| Placa | 3 letras + 4 digitos, unica |
| Asientos | 1-6 |
| Actualizacion | Pasa a PENDIENTE y alias a Pasajero#### |

## RN-010 Rutas
| Regla | Detalle |
| --- | --- |
| Rol | Solo CONDUCTOR aprobado |
| Fecha | YYYY-MM-DD |
| Hora | HH:mm |
| Asientos | 1-8 |
| Precio | >= 0.1 |
| Stops | Min 1 |
| Busqueda | Radio default 1 km (radiusKm 0.1-10) |

## RN-011 Reservas y pagos
| Regla | Detalle |
| --- | --- |
| Bloqueo | Rating < 3 o bloqueado no reserva |
| Deuda | NO_SHOW en efectivo bloquea nuevas reservas |
| Metodos | EFECTIVO, PAYPAL, TARJETA |
| Pago | Digital inicia en Payments; efectivo no crea pago |

## RN-012 Cancelacion de reserva
| Regla | Detalle |
| --- | --- |
| Reembolso | >= 1 hora antes |
| Sin reembolso | < 1 hora antes |

## RN-013 No-show
| Regla | Detalle |
| --- | --- |
| Tiempo | >= 30 min despues de salida |
| Estado | Reserva pasa a NO_SHOW |
| Pago | PENDING -> FAILED |

## RN-014 Cancelacion de ruta
| Regla | Detalle |
| --- | --- |
| Penalizacion | -1 rating si cancela < 2 horas |
| Reembolsos | Se intentan para pagos PAID/PENDING |

## RN-015 OTP de viaje
| Regla | Detalle |
| --- | --- |
| OTP | 6 digitos, cifrado en BD |
| Visibilidad | Hasta 2 horas despues de salida |
| Estados | CONFIRMADA/COMPLETADA |
| Validacion | Se marca como usado |

## RN-016 Calificaciones
| Regla | Detalle |
| --- | --- |
| Puntaje | 1 a 5 |
| Ventana | 24 horas |
| Bloqueo | Promedio < 3 |

## RN-017 Payouts
| Regla | Detalle |
| --- | --- |
| Periodo | YYYY-MM |
| Fuente | Pagos PAID sin payout |
| Estado | PENDING |

## RN-018 Perfil
| Regla | Detalle |
| --- | --- |
| Editable | nombre, apellido, celular |
| No editable | alias, correo |

Ultima actualizacion: 2026-01
