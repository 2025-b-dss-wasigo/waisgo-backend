import { buildAuthContext, validateIdentifier } from './request-context.util';
import { ErrorMessages } from '../constants/error-messages.constant';

describe('request-context utils', () => {
  it('uses the first forwarded IP when available', () => {
    const req = {
      headers: {
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        'user-agent': 'jest',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.2' },
    } as never;

    const context = buildAuthContext(req);
    expect(context).toEqual({ ip: '10.0.0.1', userAgent: 'jest' });
  });

  it('falls back to request ip when no forwarded header', () => {
    const req = {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.2' },
    } as never;

    const context = buildAuthContext(req);
    expect(context).toEqual({ ip: '127.0.0.1', userAgent: 'unknown' });
  });

  it('throws when identifier is invalid', () => {
    expect(() => validateIdentifier('invalid')).toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('id'),
    );
  });

  it('returns identifier when valid', () => {
    expect(validateIdentifier('BKG_ABCDEFGH')).toBe('BKG_ABCDEFGH');
  });
});
