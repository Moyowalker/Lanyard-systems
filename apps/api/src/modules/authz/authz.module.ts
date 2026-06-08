import { Module } from '@nestjs/common';
import { AuthzService } from './application/authz.service';

/**
 * Authorization domain. Models come from the global ModelsModule; this module
 * exposes AuthzService for token issuance and guard re-validation.
 */
@Module({
  providers: [AuthzService],
  exports: [AuthzService],
})
export class AuthzModule {}
