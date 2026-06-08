import { Module } from '@nestjs/common';
import { BranchService } from './application/branch.service';
import { BranchController } from './api/branch.controller';
import { AdminBranchController } from './api/admin-branch.controller';

@Module({
  controllers: [BranchController, AdminBranchController],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
