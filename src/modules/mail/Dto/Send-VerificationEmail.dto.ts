/**
 * DTO de entrada/salida para mail.
 */

export interface SendVerificationEmailOptions {
  to: string;
  alias: string;
  code: string;
  expiresInMinutes: number;
}
