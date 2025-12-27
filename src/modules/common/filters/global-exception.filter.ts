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

interface ExceptionResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
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

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as
        | string
        | ExceptionResponse;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        message = Array.isArray(exceptionResponse.message)
          ? exceptionResponse.message[0]
          : exceptionResponse.message || message;
        error = exceptionResponse.error || exception.name;
      }
    } else if (exception instanceof Error) {
      message = this.isDevelopment
        ? exception.message
        : 'Internal server error';
      error = exception.name;

      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }

    // Registrar eventos de seguridad
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
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

    const safeMessage =
      !this.isDevelopment && status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : message;

    const responseBody: Record<string, unknown> = {
      statusCode: status,
      message: safeMessage,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Incluir stack trace solo en desarrollo
    if (this.isDevelopment && exception instanceof Error) {
      responseBody.stack = exception.stack;
    }

    response.status(status).json(responseBody);
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0].trim();
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
