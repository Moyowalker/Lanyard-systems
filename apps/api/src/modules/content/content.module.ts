import { Module } from '@nestjs/common';

import { LeadController } from './api/lead.controller';
import { AdminLeadController } from './api/admin-lead.controller';
import { LeadService } from './application/lead.service';

@Module({
  controllers: [LeadController, AdminLeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class ContentModule {}
