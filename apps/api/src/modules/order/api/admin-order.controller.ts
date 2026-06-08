import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ActorType,
  OrderTransitionInput,
  OrderTransitionSchema,
  PaginationQuery,
  PaginationQuerySchema,
} from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { OrderService } from '../application/order.service';

/** Staff order operations — branch-scoped reads, guarded state transitions. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminOrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @RequirePermissions('order:read')
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.orders.listAdmin(query, user.branchScope);
  }

  @Get(':id')
  @RequirePermissions('order:read')
  getOne(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.orders.getAdminOne(id, user.branchScope);
  }

  @Post(':id/transition')
  @RequirePermissions('order:transition')
  transition(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(OrderTransitionSchema)) dto: OrderTransitionInput,
  ) {
    return this.orders.adminTransition(
      id,
      dto.to,
      { id: user.sub, role: user.roles[0], type: ActorType.STAFF },
      dto.reason,
    );
  }
}
