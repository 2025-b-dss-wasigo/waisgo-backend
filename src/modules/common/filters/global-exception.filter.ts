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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly auditService: AuditService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string' ? res : ((res as any).message ?? message);
    }

    this.logger.error(
      `[${status}] ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      await this.auditService.logEvent({
        action:
          status === HttpStatus.UNAUTHORIZED
            ? AuditAction.UNAUTHORIZED_ACCESS
            : AuditAction.ACCESS_DENIED_ROLE,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        result: AuditResult.FAILED,
      });
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
