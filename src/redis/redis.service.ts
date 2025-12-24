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
  private readonly logger = new Logger('RedisService');
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST'),
      port: Number(this.configService.get<string>('REDIS_PORT')),
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error', err);
    });
  }

  onModuleDestroy() {
    this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  private validateKey(key: string): void {
    if (!key || key.includes(' ') || key.includes('\n') || key.includes('\r')) {
      throw new Error('Invalid Redis key format');
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
}
