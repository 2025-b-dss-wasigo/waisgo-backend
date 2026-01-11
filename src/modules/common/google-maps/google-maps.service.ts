/**
 * Servicio de integracion con Google Maps.
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../constants/error-messages.constant';

type DirectionsResponse = {
  status?: string;
  routes?: Array<{
    overview_polyline?: {
      points?: string;
    };
  }>;
  error_message?: string;
};

type LatLng = {
  lat: number;
  lng: number;
};

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);

  constructor(private readonly configService: ConfigService) {}

  private getApiKey(): string {
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_MAPS_NOT_CONFIGURED);
    }
    return apiKey;
  }

  private getBaseUrl(): string {
    return (
      this.configService.get<string>('GOOGLE_MAPS_BASE_URL') ||
      'https://maps.googleapis.com/maps/api/directions/json'
    );
  }

  async buildRoutePolyline(stops: LatLng[]): Promise<string> {
    if (stops.length < 2) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_STOPS_REQUIRED);
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv === 'test') {
      return '';
    }

    const origin = stops[0];
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(1, -1);

    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      key: this.getApiKey(),
      mode: 'driving',
    });

    if (waypoints.length > 0) {
      params.set(
        'waypoints',
        waypoints.map((point) => `${point.lat},${point.lng}`).join('|'),
      );
    }

    const response = await fetch(`${this.getBaseUrl()}?${params.toString()}`);

    if (!response.ok) {
      this.logger.error(
        `Google Maps request failed with status ${response.status}`,
      );
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_POLYLINE_FAILED);
    }

    const payload = (await response.json()) as DirectionsResponse;
    if (payload.status !== 'OK') {
      this.logger.error(
        `Google Maps directions error: ${payload.status ?? 'UNKNOWN'} ${
          payload.error_message ?? ''
        }`,
      );
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_POLYLINE_FAILED);
    }

    const polyline = payload.routes?.[0]?.overview_polyline?.points;
    if (!polyline) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_POLYLINE_FAILED);
    }

    return polyline;
  }
}
