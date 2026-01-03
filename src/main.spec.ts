import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuditService } from './modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('@nestjs/swagger', () => ({
  SwaggerModule: {
    createDocument: jest.fn(),
    setup: jest.fn(),
  },
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiTags: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
  ApiOkResponse: () => () => undefined,
  ApiServiceUnavailableResponse: () => () => undefined,
  ApiParam: () => () => undefined,
  ApiBody: () => () => undefined,
  ApiConsumes: () => () => undefined,
  ApiHeader: () => () => undefined,
  ApiQuery: () => () => undefined,
}));

describe('bootstrap', () => {
  it('configures and starts the app', async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'PORT' ? 3000 : fallback,
      ),
    };
    const appMock = {
      setGlobalPrefix: jest.fn(),
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalPipes: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
      get: jest.fn((token: unknown) => {
        const tokenName =
          typeof token === 'function' ? token.name : String(token);
        if (token === AuditService || tokenName === 'AuditService') return {};
        if (token === ConfigService || tokenName === 'ConfigService') {
          return configService;
        }
        return null;
      }),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(appMock);
    (SwaggerModule.createDocument as jest.Mock).mockReturnValue({});

    require('./main');

    await new Promise(process.nextTick);

    const createArg = (NestFactory.create as jest.Mock).mock.calls[0]?.[0];
    expect(typeof createArg).toBe('function');
    expect(createArg?.name).toBe(AppModule.name);
    expect(appMock.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(appMock.enableCors).toHaveBeenCalled();
    expect(appMock.listen).toHaveBeenCalledWith(3000);
    expect(SwaggerModule.setup).toHaveBeenCalled();
  });
});
