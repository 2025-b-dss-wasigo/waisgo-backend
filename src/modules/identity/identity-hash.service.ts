import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * Servicio para generar hashes determinísticos y encriptar/desencriptar
 * los identificadores de usuario entre schemas auth y business.
 *
 * SEGURIDAD:
 * - Usa HMAC-SHA256 para hashes determinísticos
 * - Usa AES-256-GCM para encriptación simétrica
 * - Las claves deben mantenerse seguras y nunca exponerse
 */
@Injectable()
export class IdentityHashService {
  private readonly HASH_SECRET: string;
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm' as const;

  constructor(private readonly config: ConfigService) {
    this.HASH_SECRET = this.config.getOrThrow<string>('IDENTITY_HASH_SECRET');
    const encKeyHex = this.config.getOrThrow<string>('IDENTITY_ENCRYPTION_KEY');
    this.ENCRYPTION_KEY = Buffer.from(encKeyHex, 'hex');

    if (this.ENCRYPTION_KEY.length !== 32) {
      throw new Error(
        'IDENTITY_ENCRYPTION_KEY must be 32 bytes (64 hex chars)',
      );
    }

    if (this.HASH_SECRET.length < 32) {
      throw new Error('IDENTITY_HASH_SECRET must be at least 32 characters');
    }
  }

  /**
   * Genera un hash determinístico basado en datos inmutables del usuario.
   * Este hash se usa para correlacionar auth y business SIN exponer el UUID.
   *
   * IMPORTANTE: Los datos de entrada NUNCA deben cambiar después del registro.
   *
   * @param data - Datos inmutables del usuario
   * @returns Hash de 32 caracteres hexadecimales
   */
  generateDeterministicHash(data: { email: string; createdAt: Date }): string {
    const canonical = [
      data.email.toLowerCase().trim(),
      data.createdAt.toISOString(),
    ].join('|');

    const hmac = createHmac('sha256', this.HASH_SECRET)
      .update(canonical)
      .digest('hex');

    // Retornar primeros 32 caracteres para un identificador manejable
    return hmac.substring(0, 32);
  }

  /**
   * Encripta un UUID para almacenamiento seguro en la tabla de mapeo.
   * Usa AES-256-GCM con IV aleatorio y authentication tag.
   *
   * @param plaintext - UUID a encriptar
   * @returns Cadena encriptada en formato "iv:authTag:encrypted"
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.ALGORITHM, this.ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Formato: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Desencripta un UUID desde la tabla de mapeo.
   *
   * @param ciphertext - Cadena encriptada en formato "iv:authTag:encrypted"
   * @returns UUID desencriptado
   * @throws Error si el formato es inválido o la autenticación falla
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(this.ALGORITHM, this.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Verifica que un hash corresponda a los datos proporcionados.
   * Usa comparación en tiempo constante para prevenir timing attacks.
   *
   * @param hash - Hash a verificar
   * @param data - Datos originales
   * @returns true si el hash coincide
   */
  verifyHash(hash: string, data: { email: string; createdAt: Date }): boolean {
    const expectedHash = this.generateDeterministicHash(data);

    if (hash.length !== expectedHash.length) {
      return false;
    }

    try {
      return timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
    } catch {
      return false;
    }
  }
}
