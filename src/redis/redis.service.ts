/**
 * Servicio de negocio del modulo redis.
 */

import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Servicio de cache y revocacion de sesiones en Redis.
 * @security Centraliza TTLs para tokens y OTP.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST'),
      port: Number(this.configService.get<string>('REDIS_PORT')),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          this.logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error', err.message);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Redis key must be a non-empty string');
    }
    if (/[\s\0]/.test(key)) {
      throw new Error('Redis key contains invalid characters');
    }
    if (key.length > 512) {
      throw new Error('Redis key exceeds maximum length');
    }
  }

  async set(key: string, value: string | number, ttl?: number): Promise<void> {
    this.validateKey(key);
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    this.validateKey(key);
    return this.client.get(key);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      keys.forEach((k) => this.validateKey(k));
      await this.client.del(...keys);
    }
  }

  async incr(key: string): Promise<number> {
    this.validateKey(key);
    return this.client.incr(key);
  }

  /**
   * Verifica revocacion por jti.
   * @security Si el formato es invalido, revoca por defecto.
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        jti,
      )
    ) {
      return true;
    }
    const result = await this.client.get(`revoke:jti:${jti}`);
    return result !== null;
  }

  /**
   * Guarda OTP y contadores con TTL.
   * @security Limita reintentos y reenvios.
   */
  async saveOtpSession(
    otpKey: string,
    otpValue: string,
    otpTtl: number,
    attemptsKey: string,
    resendKey: string,
    resendCount: number,
  ): Promise<void> {
    this.validateKey(otpKey);
    this.validateKey(attemptsKey);
    this.validateKey(resendKey);

    const pipeline = this.client.pipeline();

    pipeline.set(otpKey, otpValue, 'EX', otpTtl);

    pipeline.set(attemptsKey, 0, 'EX', otpTtl);

    pipeline.set(resendKey, resendCount + 1, 'EX', 60 * 60);

    await pipeline.exec();
  }

  /**
   * Verifica si el usuario revoco todas sus sesiones.
   * @security Usa timestamp de revocacion en Redis.
   */
  async isUserSessionRevoked(
    userId: string,
    tokenIssuedAt: number,
  ): Promise<boolean> {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return true;
    }

    const revokedAt = await this.client.get(`revoke:user:${userId}`);
    if (!revokedAt) return false;

    const revokedTimestamp = Number.parseInt(revokedAt, 10);
    return tokenIssuedAt < revokedTimestamp;
  }

  /**
   * Revoca todas las sesiones de un usuario.
   * @security Guarda el momento para invalidar tokens antiguos.
   */
  async revokeUserSessions(
    userId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    await this.set(`revoke:user:${userId}`, nowInSeconds, ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    this.validateKey(key);
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    this.validateKey(key);
    return this.client.ttl(key);
  }
}
