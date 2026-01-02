import { lastValueFrom, of } from 'rxjs';
import { ExecutionContext } from '@nestjs/common';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const ctx = {} as ExecutionContext;

  it('wraps undefined responses as success without data', async () => {
    const interceptor = new ResponseInterceptor();
    const handler = { handle: () => of(undefined) };

    const result = await lastValueFrom(
      interceptor.intercept(ctx, handler as never),
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('wraps plain payloads under data', async () => {
    const interceptor = new ResponseInterceptor();
    const payload = { ok: true };
    const handler = { handle: () => of(payload) };

    const result = await lastValueFrom(
      interceptor.intercept(ctx, handler as never),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(payload);
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('preserves success and message for already formatted responses', async () => {
    const interceptor = new ResponseInterceptor();
    const payload = { success: true, message: 'ok' };
    const handler = { handle: () => of(payload) };

    const result = await lastValueFrom(
      interceptor.intercept(ctx, handler as never),
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('ok');
    expect(result.data).toBeUndefined();
  });

  it('keeps userId under data when only success/message/userId are present', async () => {
    const interceptor = new ResponseInterceptor();
    const payload = { success: true, message: 'ok', userId: 'USR_1234' };
    const handler = { handle: () => of(payload) };

    const result = await lastValueFrom(
      interceptor.intercept(ctx, handler as never),
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('ok');
    expect(result.data).toEqual({ userId: 'USR_1234' });
  });

  it('preserves success false for formatted responses with data', async () => {
    const interceptor = new ResponseInterceptor();
    const payload = { success: false, message: 'fail', reason: 'bad' };
    const handler = { handle: () => of(payload) };

    const result = await lastValueFrom(
      interceptor.intercept(ctx, handler as never),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe('fail');
    expect(result.data).toEqual({ reason: 'bad' });
  });
});
