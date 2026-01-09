/**
 * Pruebas unitarias de common.
 */

import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { GlobalExceptionFilter } from './global-exception.filter';
import { AuditAction, AuditResult } from 'src/modules/audit/Enums';
import { ErrorCodes, ErrorMessages } from '../constants/error-messages.constant';

describe('GlobalExceptionFilter', () => {
  const auditService = {
    logEvent: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  const buildHost = (overrides: Partial<Request> = {}) => {
    const request = {
      method: 'GET',
      path: '/test',
      url: '/test',
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.2' },
      ...overrides,
    } as Request;

    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { host, response };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    auditService.logEvent.mockResolvedValue(undefined);
  });

  it('returns development response for handled http exceptions', async () => {
    configService.get.mockReturnValue('development');
    const filter = new GlobalExceptionFilter(
      auditService as never,
      configService as never,
    );
    const { host, response } = buildHost();
    const exception = new HttpException(
      'bad request',
      HttpStatus.BAD_REQUEST,
    );

    await filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = response.json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'bad request',
        code: ErrorCodes.VALIDATION_ERROR,
        path: '/test',
        method: 'GET',
      }),
    );
    expect(body).not.toHaveProperty('stack');
    expect(auditService.logEvent).not.toHaveBeenCalled();
  });

  it('includes stack trace for unexpected errors in development', async () => {
    configService.get.mockReturnValue('development');
    const filter = new GlobalExceptionFilter(
      auditService as never,
      configService as never,
    );
    const { host, response } = buildHost();

    await filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const body = response.json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: ErrorMessages.SYSTEM.INTERNAL_ERROR,
        code: ErrorCodes.SYSTEM_ERROR,
        path: '/test',
        method: 'GET',
      }),
    );
    expect(body.stack).toEqual(expect.any(String));
  });

  it('audits unauthorized access and uses forwarded ip in production', async () => {
    configService.get.mockReturnValue('production');
    const filter = new GlobalExceptionFilter(
      auditService as never,
      configService as never,
    );
    const { host, response } = buildHost({
      headers: {
        'user-agent': 'jest',
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      },
    });
    const exception = new HttpException(
      { message: ['invalid'], code: 'CUSTOM' },
      HttpStatus.UNAUTHORIZED,
    );

    await filter.catch(exception, host);

    const body = response.json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'invalid',
        code: 'CUSTOM',
      }),
    );
    expect(body).not.toHaveProperty('path');
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UNAUTHORIZED_ACCESS,
        result: AuditResult.FAILED,
        ipAddress: '10.0.0.1',
      }),
    );
  });
});
