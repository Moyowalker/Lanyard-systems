import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { validateEnv } from './core/config/env.validation';
import { DatabaseModule } from './core/database/database.module';
import { ModelsModule } from './database/models.module';
import { SecurityModule } from './core/security/security.module';
import { JwtAuthGuard } from './core/auth/jwt-auth.guard';
import { HealthModule } from './modules/health/health.module';
import { AuthzModule } from './modules/authz/authz.module';
import { IdentityModule } from './modules/identity/identity.module';
import { BranchModule } from './modules/branch/branch.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PlatformModule } from './core/platform/platform.module';
import { StorageModule } from './core/storage/storage.module';
import { QueueModule } from './core/queue/queue.module';
import { CartModule } from './modules/cart/cart.module';
import { OrderModule } from './modules/order/order.module';
import { PrescriptionModule } from './modules/prescription/prescription.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AuditModule } from './modules/audit/audit.module';
import { ContentModule } from './modules/content/content.module';

/**
 * Root composition. Domain modules are added here as they are implemented; their
 * persistence is available through the global ModelsModule, and auth primitives
 * through the global SecurityModule. JwtAuthGuard runs globally — routes opt out
 * with @Public().
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 300,
      },
    ]),
    DatabaseModule,
    ModelsModule,
    SecurityModule,
    PlatformModule,
    StorageModule,
    QueueModule,
    NotificationModule,
    ContentModule,
    HealthModule,
    AuthzModule,
    IdentityModule,
    BranchModule,
    CatalogModule,
    PricingModule,
    InventoryModule,
    CartModule,
    OrderModule,
    PrescriptionModule,
    PaymentModule,
    AuditModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
