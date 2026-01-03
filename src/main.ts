import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './modules/common/filters/global-exception.filter';
import { ResponseInterceptor } from './modules/common/interceptors/response.interceptor';
import { AuditService } from './modules/audit/audit.service';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const auditService = app.get(AuditService);
  const configService = app.get(ConfigService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', !isProd);
  const trustProxy = configService.get<boolean>('TRUST_PROXY', false);
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

  app.setGlobalPrefix('api');

  if (trustProxy) {
    const server = app.getHttpAdapter().getInstance();
    server.set('trust proxy', 1);
  }

  app.use(helmet());

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  // Interceptor para estandarizar respuestas exitosas
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Filtro global para manejar excepciones
  app.useGlobalFilters(new GlobalExceptionFilter(auditService, configService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('WasiGo API')
      .setDescription('Backend de la plataforma de carpooling WasiGo')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWE',
          description: 'Ingrese su token JWE (Login)',
        },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('docs', app, document, {
      useGlobalPrefix: true,
    });
  }

  await app.listen(configService.get<number>('PORT') ?? 3000);

  logger.log(
    `App running on port ${configService.get<number>('PORT') ?? 3000}`,
  );
  if (swaggerEnabled) {
    logger.log(
      `Swagger Docs available at http://localhost:${configService.get<number>('PORT') ?? 3000}/api/docs`,
    );
  }
}
void bootstrap(); // NOSONAR
