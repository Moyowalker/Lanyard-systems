import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateLeadInput, CreateLeadSchema } from '@lanyard/contracts';

import { Public } from '../../../core/auth/auth.decorators';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { LeadService } from '../application/lead.service';

@ApiTags('leads')
@Controller('leads')
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  @Public()
  @Post()
  capture(@Body(new ZodValidationPipe(CreateLeadSchema)) dto: CreateLeadInput) {
    return this.leads.capture(dto);
  }
}