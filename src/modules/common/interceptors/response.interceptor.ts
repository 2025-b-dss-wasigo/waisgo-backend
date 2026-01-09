/**
 * Interceptor para respuestas o pipeline HTTP.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { sanitizeResponseData } from '../utils/response-sanitizer.util';

/**
 * Respuesta estandarizada para el frontend
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

/**
 * Interceptor que estandariza todas las respuestas exitosas
 *
 * Formato de respuesta:
 * {
 *   success: true,
 *   data: { ... },        // Los datos del endpoint
 *   message: "...",       // Mensaje opcional (si la respuesta original lo incluia)
 *   timestamp: "..."      // ISO timestamp
 * }
 *
 * Si la respuesta original ya tiene { success, message },
 * se preservan y se envuelven correctamente.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => this.transformResponse(data)));
  }

  private transformResponse(data: unknown): ApiResponse<T> {
    const timestamp = new Date().toISOString();

    // Si no hay datos, retornar respuesta vacia exitosa
    if (data === null || data === undefined) {
      return {
        success: true,
        timestamp,
      };
    }

    // Si ya tiene el formato esperado con success/message, preservar estructura
    if (this.isAlreadyFormatted(data)) {
      const formatted = data as { success?: boolean; message?: string };

      // Extraer message si existe
      const { success, message, ...rest } = formatted;
      const sanitizedRest = sanitizeResponseData(rest) as Record<
        string,
        unknown
      >;
      const restKeys = sanitizedRest ? Object.keys(sanitizedRest) : [];

      // Si solo tiene success y message, no envolver en data
      const hasOnlySuccessAndMessage =
        restKeys.length === 0 ||
        (restKeys.length === 1 && 'userId' in sanitizedRest);

      if (hasOnlySuccessAndMessage) {
        return {
          success: success !== false,
          message,
          ...(restKeys.length > 0 ? { data: sanitizedRest as T } : {}),
          timestamp,
        };
      }

      // Propiedades van en data
      return {
        success: success !== false,
        message,
        data: sanitizedRest as T,
        timestamp,
      };
    }

    // Respuesta normal: envolver en data
    return {
      success: true,
      data: sanitizeResponseData(data) as T,
      timestamp,
    };
  }

  /**
   * Verifica si la respuesta ya tiene formato { success, message }
   */
  private isAlreadyFormatted(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    return (
      ('success' in obj && typeof obj.success === 'boolean') ||
      ('message' in obj && typeof obj.message === 'string')
    );
  }
}
