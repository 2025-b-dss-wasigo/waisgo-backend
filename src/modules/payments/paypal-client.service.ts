import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { URLSearchParams } from 'node:url';
import { ErrorMessages } from '../common/constants/error-messages.constant';

type PaypalRequestOptions = {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

@Injectable()
export class PaypalClientService {
  private readonly logger = new Logger(PaypalClientService.name);

  constructor(private readonly configService: ConfigService) {}

  private getCredentials() {
    const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
    const clientSecret =
      this.configService.get<string>('PAYPAL_CLIENT_SECRET') ||
      this.configService.get<string>('PAYPAL_SECRET');
    const baseUrl = this.configService.get<string>('PAYPAL_BASE_URL');

    if (!clientId || !clientSecret || !baseUrl) {
      throw new Error('PayPal credentials are not configured');
    }

    return { clientId, clientSecret, baseUrl };
  }

  private async getAccessToken(): Promise<string> {
    const { clientId, clientSecret, baseUrl } = this.getCredentials();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`PayPal token error: ${errorText}`);
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    return data.access_token;
  }

  async request<T>({
    method,
    path,
    body,
    headers,
  }: PaypalRequestOptions): Promise<T> {
    const { baseUrl } = this.getCredentials();
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`PayPal request error: ${errorText}`);
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    return (await response.json()) as T;
  }
}
