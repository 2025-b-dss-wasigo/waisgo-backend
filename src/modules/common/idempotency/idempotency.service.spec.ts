import { BadRequestException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

class FakeRedisService {
  private store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
}

describe('IdempotencyService', () => {
  it('normalizes and validates idempotency keys', () => {
    const service = new IdempotencyService(new FakeRedisService() as never);

    expect(service.normalizeKey('')).toBeNull();
    expect(service.normalizeKey('   ')).toBeNull();
    expect(service.normalizeKey('ABCDEF12')).toBe('ABCDEF12');
    expect(service.normalizeKey('  ABCDEF12  ')).toBe('ABCDEF12');
    expect(() => service.normalizeKey('bad key')).toThrow(BadRequestException);
  });

  it('stores and retrieves cached responses', async () => {
    const service = new IdempotencyService(new FakeRedisService() as never);
    await service.store('scope', 'user', 'key', { ok: true });

    const value = await service.get<{ ok: boolean }>('scope', 'user', 'key');

    expect(value).toEqual({ ok: true });
  });

  it('returns null when stored payload is invalid', async () => {
    const redis = new FakeRedisService();
    const service = new IdempotencyService(redis as never);

    await redis.set('idempotency:scope:user:key', 'not-json');

    const value = await service.get('scope', 'user', 'key');

    expect(value).toBeNull();
  });
});
