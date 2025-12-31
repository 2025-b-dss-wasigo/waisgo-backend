import { PaypalClientService } from './paypal-client.service';
import { ErrorMessages } from '../common/constants/error-messages.constant';

describe('PaypalClientService', () => {
  const configService = {
    get: jest.fn(),
  };

  const setCredentials = () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'PAYPAL_CLIENT_ID') return 'client';
      if (key === 'PAYPAL_CLIENT_SECRET') return 'secret';
      if (key === 'PAYPAL_BASE_URL') return 'https://api.paypal.test';
      return undefined;
    });
  };

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as { fetch?: typeof fetch }).fetch = fetchMock as never;
    jest.clearAllMocks();
  });

  it('throws when credentials are missing', async () => {
    configService.get.mockReturnValue(undefined);
    const service = new PaypalClientService(configService as never);

    await expect(
      service.request({ method: 'GET', path: '/v1/test' }),
    ).rejects.toThrow('PayPal credentials are not configured');
  });

  it('throws when token request fails', async () => {
    setCredentials();
    const service = new PaypalClientService(configService as never);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => 'error',
    });

    await expect(
      service.request({ method: 'GET', path: '/v1/test' }),
    ).rejects.toThrow(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
  });

  it('throws when api request fails', async () => {
    setCredentials();
    const service = new PaypalClientService(configService as never);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'error',
      });

    await expect(
      service.request({ method: 'GET', path: '/v1/test' }),
    ).rejects.toThrow(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
  });

  it('returns response data for successful calls', async () => {
    setCredentials();
    const service = new PaypalClientService(configService as never);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

    const result = await service.request({
      method: 'GET',
      path: '/v1/test',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer token',
    );
  });
});
