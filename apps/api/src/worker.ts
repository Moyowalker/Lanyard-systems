import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * Worker entrypoint. Boots the SAME AppModule (so all services/repositories are
 * available) but as a headless application context — no HTTP server. BullMQ queue
 * processors (AV scan, notifications, payment reconciliation, reports, inventory
 * expiry) are registered here in later phases. See docs/architecture/03 §9.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log('Worker started. Queue processors will be registered in later phases.', 'Worker');
}

void bootstrap();
