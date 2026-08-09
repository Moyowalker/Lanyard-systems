import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BranchPaginationQuery,
  BranchPaginationQuerySchema,
  PaginationQuery,
  PrescriptionAdminSearchQuery,
  PrescriptionAdminSearchQuerySchema,
  RequestPrescriptionInfoInput,
  RequestPrescriptionInfoSchema,
  VerifyPrescriptionInput,
  VerifyPrescriptionSchema,
} from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { PrescriptionService } from '../application/prescription.service';

/** Pharmacist verification workflow — the regulatory core of the platform. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/prescriptions')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminPrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get()
  @RequirePermissions('rx:read')
  queue(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(BranchPaginationQuerySchema)) query: BranchPaginationQuery,
  ) {
    return this.prescriptions.queue(user.branchScope, query);
  }

  /** Recall search for disputes — by customer phone or order number, across all statuses. */
  @Get('search')
  @RequirePermissions('rx:read')
  search(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(PrescriptionAdminSearchQuerySchema))
    query: PrescriptionAdminSearchQuery,
  ) {
    return this.prescriptions.searchAdmin(user.branchScope, query);
  }

  @Get(':id')
  @RequirePermissions('rx:read')
  getOne(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.prescriptions.adminGet(user.branchScope, id);
  }

  /** Signed URL for a prescription image — PHI access, separately gated by phi:view and audited. */
  @Get(':id/files/:fileId/url')
  @RequirePermissions('rx:read', 'phi:view')
  fileUrl(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.prescriptions.getAdminFileUrl(user, id, fileId);
  }

  @Post(':id/verify')
  @RequirePermissions('rx:verify')
  verify(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(VerifyPrescriptionSchema)) dto: VerifyPrescriptionInput,
  ) {
    return this.prescriptions.verify(user, id, dto);
  }

  @Post(':id/request-info')
  @RequirePermissions('rx:verify')
  requestInfo(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RequestPrescriptionInfoSchema)) dto: RequestPrescriptionInfoInput,
  ) {
    return this.prescriptions.requestInfo(user, id, dto);
  }
}
