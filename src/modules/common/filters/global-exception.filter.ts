/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { ConfigService } from '@nestjs/config';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/modules/audit/Enums/audit-actions.enum';
import { AuditResult } from 'src/modules/audit/Enums/audit-result.enum';
import {
  ErrorCodes,
  ErrorMessages,
} from '../constants/error-messages.constant';

interface ExceptionResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
  code?: string; // Código de error para el frontend
}

/**
 * Respuesta de error estandarizada para el frontend
 */
interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  code: string;
  timestamp: string;
}

/**
 * Respuesta de error extendida solo para desarrollo
 */
interface DevErrorResponse extends ApiErrorResponse {
  path: string;
  method: string;
  stack?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isDevelopment: boolean;

  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') !== 'production';
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { status, message, code } = this.extractErrorInfo(exception);

    // Log interno detallado (para Loki/Grafana en el futuro)
    this.logError(exception, request, status);

    // Auditoría de eventos de seguridad
    await this.auditSecurityEvent(request, status);

    // Respuesta limpia para el frontend
    const responseBody = this.buildResponse(
      exception,
      request,
      status,
      message,
      code,
    );

    response.status(status).json(responseBody);
  }

  /**
   * Extrae información del error de forma estandarizada
   */
  private extractErrorInfo(exception: unknown): {
    status: number;
    message: string;
    code: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as
        | string
        | ExceptionResponse;

      if (typeof exceptionResponse === 'string') {
        return {
          status,
          message: exceptionResponse,
          code: this.getErrorCode(status),
        };
      }

      // Extraer mensaje (tomar el primero si es array de validaciones)
      const message = Array.isArray(exceptionResponse.message)
        ? exceptionResponse.message[0]
        : exceptionResponse.message || this.getDefaultMessage(status);

      const code = exceptionResponse.code || this.getErrorCode(status);

      return { status, message, code };
    }

    // Error no manejado
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ErrorMessages.SYSTEM.INTERNAL_ERROR,
      code: ErrorCodes.SYSTEM_ERROR,
    };
  }

  /**
   * Log interno detallado - preparado para Loki/Grafana
   */
  private logError(exception: unknown, request: Request, status: number): void {
    const logContext = {
      path: request.path,
      method: request.method,
      statusCode: status,
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'],
      userId: (request as Request & { user?: { id?: string } }).user?.id,
    };

    if (exception instanceof HttpException) {
      // Errores controlados: log como warn (4xx) o error (5xx)
      if (status >= 500) {
        this.logger.error(
          `[${request.method}] ${request.path} - ${status}`,
          JSON.stringify(logContext),
        );
      } else if (status >= 400) {
        this.logger.warn(
          `[${request.method}] ${request.path} - ${status}`,
          JSON.stringify(logContext),
        );
      }
    } else if (exception instanceof Error) {
      // Errores no controlados: log completo con stack trace
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
        JSON.stringify(logContext),
      );
    } else {
      this.logger.error(
        'Unknown error type',
        JSON.stringify({ exception, ...logContext }),
      );
    }
  }

  /**
   * Auditoría de eventos de seguridad (401, 403)
   */
  private async auditSecurityEvent(
    request: Request,
    status: number,
  ): Promise<void> {
    if (status !== HttpStatus.UNAUTHORIZED && status !== HttpStatus.FORBIDDEN) {
      return;
    }

    try {
      const user = (request as Request & { user?: { id?: string } }).user;
      await this.auditService.logEvent({
        action:
          status === HttpStatus.UNAUTHORIZED
            ? AuditAction.UNAUTHORIZED_ACCESS
            : AuditAction.ACCESS_DENIED_ROLE,
        userId: user?.id,
        ipAddress: this.getClientIp(request),
        userAgent: request.headers['user-agent'],
        result: AuditResult.FAILED,
        metadata: {
          path: request.path,
          method: request.method,
        },
      });
    } catch (auditError) {
      this.logger.error('Failed to log audit event', auditError);
    }
  }

  /**
   * Construye la respuesta para el frontend
   * Producción: Respuesta limpia y mínima
   * Desarrollo: Incluye información adicional para debugging
   */
  private buildResponse(
    exception: unknown,
    request: Request,
    status: number,
    message: string,
    code: string,
  ): ApiErrorResponse | DevErrorResponse {
    const timestamp = new Date().toISOString();

    // Respuesta base para producción - limpia y concisa
    const baseResponse: ApiErrorResponse = {
      success: false,
      statusCode: status,
      message,
      code,
      timestamp,
    };

    // En desarrollo, agregar info adicional para debugging
    if (this.isDevelopment) {
      const devResponse: DevErrorResponse = {
        ...baseResponse,
        path: request.url,
        method: request.method,
      };

      // Stack trace solo en desarrollo y para errores no controlados
      if (exception instanceof Error && status >= 500) {
        devResponse.stack = exception.stack;
      }

      return devResponse;
    }

    return baseResponse;
  }

  /**
   * Obtiene el código de error basado en el status HTTP
   */
  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.USER_NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.RATE_LIMIT;
      default:
        return ErrorCodes.SYSTEM_ERROR;
    }
  }

  /**
   * Mensaje por defecto según el status HTTP
   */
  private getDefaultMessage(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Datos inválidos';
      case HttpStatus.UNAUTHORIZED:
        return ErrorMessages.SYSTEM.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorMessages.SYSTEM.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorMessages.SYSTEM.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorMessages.SYSTEM.TOO_MANY_REQUESTS;
      default:
        return ErrorMessages.SYSTEM.INTERNAL_ERROR;
    }
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp =
      typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '';
    return (
      forwardedIp ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }
}
