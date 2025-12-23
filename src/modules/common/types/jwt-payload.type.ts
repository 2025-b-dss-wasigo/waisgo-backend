export interface JwtPayload {
  id: string;
  role: string;
  isVerified: boolean;
  alias: string;
  jti: string;
}
