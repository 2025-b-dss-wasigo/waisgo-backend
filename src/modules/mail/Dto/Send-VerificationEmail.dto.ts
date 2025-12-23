export interface SendVerificationEmailOptions {
  to: string;
  alias: string;
  code: string;
  expiresInMinutes: number;
}
