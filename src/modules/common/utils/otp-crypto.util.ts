/**
 * Utilidades del modulo common.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const OTP_ENCRYPTION_SEPARATOR = '.';

/**
 * Deriva una clave SHA-256 para cifrar OTP.
 * @security Evita usar el secreto en claro.
 */
const buildKey = (secret: string): Buffer =>
  createHash('sha256').update(secret).digest();

/**
 * Cifra el OTP con AES-256-GCM.
 * @security Incluye iv y auth tag en el payload.
 */
export const encryptOtp = (otp: string, secret: string): string => {
  const key = buildKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(otp, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    tag.toString('base64'),
  ].join(OTP_ENCRYPTION_SEPARATOR);
};

/**
 * Descifra el OTP y valida el auth tag.
 * @security Retorna null si el payload es invalido.
 */
export const decryptOtp = (payload: string, secret: string): string | null => {
  const parts = payload.split(OTP_ENCRYPTION_SEPARATOR);
  if (parts.length !== 3) {
    return null;
  }

  const [ivBase64, dataBase64, tagBase64] = parts;

  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const encrypted = Buffer.from(dataBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');

    if (iv.length !== 12 || tag.length !== 16) {
      return null;
    }

    const key = buildKey(secret);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Comparacion en tiempo constante.
 * @security Reduce riesgo de timing attacks.
 */
export const secureCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
};
