import { Global, Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { AuditService } from './audit.service';

/** Global cross-cutting platform services: transactions + audit logging. */
@Global()
@Module({
  providers: [TransactionService, AuditService],
  exports: [TransactionService, AuditService],
})
export class PlatformModule {}
