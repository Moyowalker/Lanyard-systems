import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BranchLocatorQuery, BranchLocatorQuerySchema } from '@lanyard/contracts';

import { Public } from '../../../core/auth/auth.decorators';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { BranchService } from '../application/branch.service';

/** Public branch locator + detail (no auth). */
@ApiTags('branches')
@Controller('branches')
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Public()
  @Get()
  async list(@Query(new ZodValidationPipe(BranchLocatorQuerySchema)) query: BranchLocatorQuery) {
    return { data: await this.branches.findPublic(query) };
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.branches.getPublic(id);
  }
}
