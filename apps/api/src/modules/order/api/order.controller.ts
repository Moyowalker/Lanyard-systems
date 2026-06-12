import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateOrderInput,
  CreateOrderSchema,
  PaginationQuery,
  PaginationQuerySchema,
} from '@lanyard/contracts';

import { CurrentUser, RequireRealm } from '../../../core/auth/auth.decorators';
import { RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { OrderService } from '../application/order.service';

/** Customer-facing checkout & orders. */
@ApiTags('orders')
@ApiBearerAuth()
@Controller()
@UseGuards(RealmGuard)
@RequireRealm('customer')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('checkout/quote')
  quote(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderInput,
  ) {
    return this.orders.quote(user.sub, dto.fulfillment);
  }

  @Post('orders')
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderInput,
  ) {
    return this.orders.createOrder(user, dto);
  }

  @Get('orders')
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.orders.getMine(user.sub, query);
  }

  @Get('orders/:id')
  getOne(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.orders.getMineOne(user.sub, id);
  }

  @Get('orders/:id/tracking')
  tracking(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.orders.tracking(user.sub, id);
  }

  @Post('orders/:id/reorder')
  reorder(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.orders.reorder(user.sub, id);
  }
}
