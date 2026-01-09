/**
 * Servicio de negocio del modulo common.
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { ErrorMessages } from '../constants/error-messages.constant';

type StoredResponse<T> = {
  data: T;
};

@Injectable()
export class IdempotencyService {
  private readonly DEFAULT_TTL_SECONDS = 10 * 60;
  private readonly KEY_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

  constructor(private readonly redisService: RedisService) {}

  normalizeKey(rawKey?: string): string | null {
    if (!rawKey) {
      return null;
    }
    const trimmed = rawKey.trim();
    if (!trimmed) {
      return null;
    }
    if (!this.KEY_REGEX.test(trimmed)) {
      throw new BadRequestException(
        ErrorMessages.VALIDATION.INVALID_FORMAT('idempotencyKey'),
      );
    }
    return trimmed;
  }

  private buildKey(scope: string, userId: string, key: string): string {
    return `idempotency:${scope}:${userId}:${key}`;
  }

  async get<T>(
    scope: string,
    userId: string,
    key: string,
  ): Promise<T | null> {
    const stored = await this.redisService.get(
      this.buildKey(scope, userId, key),
    );
    if (!stored) {
      return null;
    }
    try {
      const parsed = JSON.parse(stored) as StoredResponse<T>;
      return parsed.data ?? null;
    } catch {
      return null;
    }
  }

  async store<T>(
    scope: string,
    userId: string,
    key: string,
    data: T,
    ttlSeconds = this.DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const payload: StoredResponse<T> = { data };
    await this.redisService.set(
      this.buildKey(scope, userId, key),
      JSON.stringify(payload),
      ttlSeconds,
    );
  }
}
