import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the unparsed request body so payment webhook signatures
  // can be verified against the exact bytes the provider signed.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_GLOBAL_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);

  // Canonical error envelope for every thrown error.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Security headers + CORS for the web apps.
  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', '').split(',').filter(Boolean),
    credentials: true,
  });

  // Reject unknown fields and coerce DTOs — never trust the client.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  // OpenAPI — the contract the api-client (and future mobile app) is generated from.
  const openApi = new DocumentBuilder()
    .setTitle('Lanyard Platform API')
    .setDescription('Lanyard Pharmacy Digital Commerce Platform — Engine API')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, openApi));

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/${prefix}`, 'Bootstrap');
  Logger.log(`OpenAPI docs at http://localhost:${port}/${prefix}/docs`, 'Bootstrap');
}

void bootstrap();
