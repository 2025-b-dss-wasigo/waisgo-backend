import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
 *   message: "...",       // Mensaje opcional (si la respuesta original lo incluía)
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

    // Si no hay datos, retornar respuesta vacía exitosa
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

      // Si solo tiene success y message, no envolver en data
      const hasOnlySuccessAndMessage =
        Object.keys(rest).length === 0 ||
        (Object.keys(rest).length === 1 && 'userId' in rest);

      if (hasOnlySuccessAndMessage) {
        return {
          success: success !== false,
          message,
          ...(Object.keys(rest).length > 0 ? { data: rest as T } : {}),
          timestamp,
        };
      }

      // Si tiene más propiedades, todo va en data
      return {
        success: success !== false,
        message,
        data: rest as T,
        timestamp,
      };
    }

    // Respuesta normal: envolver en data
    return {
      success: true,
      data: data as T,
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
