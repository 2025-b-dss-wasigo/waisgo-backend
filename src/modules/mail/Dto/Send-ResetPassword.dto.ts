/**
 * DTO de entrada/salida para mail.
 */

export interface SendResetPasswordOptions {
  to: string;
  name?: string;
  resetUrl: string;
}
