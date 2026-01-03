type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const buildResponse = (payload: unknown): MockResponse => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

const buildErrorResponse = (message: string, status = 400): MockResponse => ({
  ok: false,
  status,
  json: async () => ({ message }),
  text: async () => message,
});

export const mockPaypalFetch = (): jest.Mock => {
  const mock = jest.fn(async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/v1/oauth2/token')) {
      return buildResponse({ access_token: 'test-token' });
    }

    if (url.includes('/v2/checkout/orders') && url.includes('/capture')) {
      return buildResponse({
        status: 'COMPLETED',
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: 'CAPTURE123',
                  status: 'COMPLETED',
                  amount: { value: '3.50', currency_code: 'USD' },
                },
              ],
            },
          },
        ],
      });
    }

    if (url.includes('/v2/checkout/orders')) {
      return buildResponse({
        id: 'ORDER123',
        status: 'CREATED',
        links: [{ rel: 'approve', href: 'https://paypal.test/approve' }],
      });
    }

    if (url.includes('/v2/payments/captures/') && url.endsWith('/refund')) {
      return buildResponse({ status: 'COMPLETED' });
    }

    if (url.includes('/v1/payments/payouts')) {
      return buildResponse({
        batch_header: {
          payout_batch_id: 'BATCH123',
          batch_status: 'SUCCESS',
        },
      });
    }

    return buildErrorResponse('Unknown PayPal request', 404);
  });

  globalThis.fetch = mock as never;
  return mock;
};

export const restoreFetch = (original?: typeof fetch): void => {
  if (original) {
    globalThis.fetch = original;
  }
};
