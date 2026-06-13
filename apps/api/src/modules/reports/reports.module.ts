import { Module } from '@nestjs/common';

import { ReportsService } from './application/reports.service';
import { AdminReportsController } from './api/admin-reports.controller';

/**
 * Read-only reporting/insights over orders. Models come from the global ModelsModule;
 * no writes, no external calls — purely aggregates existing data.
 */
@Module({
  controllers: [AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
