import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  DeliveryActionInput,
  DeliveryActionSchema,
  DispatchDeliveryInput,
  DispatchDeliverySchema,
} from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { DeliveryService } from '../application/delivery.service';

/** Staff delivery dispatch — branch-scoped; reuses order:read / order:transition. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/deliveries')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminDeliveryController {
  constructor(private readonly deliveries: DeliveryService) {}

  @Get()
  @RequirePermissions('order:read')
  board(@CurrentUser() user: AuthPrincipal) {
    return this.deliveries.board(user.branchScope);
  }

  @Post(':orderId/dispatch')
  @RequirePermissions('order:transition')
  dispatch(
    @CurrentUser() user: AuthPrincipal,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(DispatchDeliverySchema)) dto: DispatchDeliveryInput,
  ) {
    return this.deliveries.dispatch(user, orderId, dto);
  }

  @Post(':orderId/status')
  @RequirePermissions('order:transition')
  act(
    @CurrentUser() user: AuthPrincipal,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(DeliveryActionSchema)) dto: DeliveryActionInput,
  ) {
    return this.deliveries.act(user, orderId, dto);
  }
}
