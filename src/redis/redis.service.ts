import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

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
    if (/[\s\n\r\0]/.test(key)) {
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
