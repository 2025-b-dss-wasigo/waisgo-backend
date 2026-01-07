import { RolUsuarioEnum } from 'src/modules/auth/Enum';

/**
 * Payload del token JWE.
 *
 * IMPORTANTE: El campo 'sub' ahora contiene el businessUserId,
 * NO el authUserId. Esto desacopla completamente los schemas auth y business.
 */
export type JwtPayload = {
  /**
   * ID del usuario en business.business_users (UUID).
   * Este es el identificador principal para operaciones de negocio.
   * @deprecated Usar 'sub' en su lugar
   */
  id: string;

  /**
   * Subject: ID del usuario en business.business_users (UUID).
   * Este es el identificador principal desacoplado de auth.
   */
  sub: string;

  /**
   * JWT ID único para revocación de tokens individuales.
   */
  jti: string;

  /**
   * Timestamp de expiración (Unix epoch en segundos).
   */
  exp: number;

  /**
   * Timestamp de emisión (Unix epoch en segundos).
   */
  iat: number;

  /**
   * Rol del usuario (USER, DRIVER, ADMIN).
   */
  role: RolUsuarioEnum;

  /**
   * Alias del usuario (ej: Pasajero1234).
   */
  alias: string;

  /**
   * Si el usuario ha verificado su cuenta.
   */
  isVerified: boolean;

  /**
   * PublicId del usuario (ej: USR_XXXXXXXX).
   */
  publicId?: string;
};
