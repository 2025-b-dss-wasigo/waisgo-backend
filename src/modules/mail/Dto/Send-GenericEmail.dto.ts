/**
 * DTO de entrada/salida para mail.
 */

export interface SendGenericEmailDto {
  to: string;
  subject: string;
  message: string;
}
