import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AddCartItemInput,
  AddCartItemSchema,
  AnonymousAddCartItemInput,
  AnonymousAddCartItemSchema,
  AnonymousCartInput,
  AnonymousCartSchema,
  LinkPrescriptionsInput,
  LinkPrescriptionsSchema,
  MergeCartInput,
  MergeCartSchema,
} from '@lanyard/contracts';

import { CurrentUser, Public, RequireRealm } from '../../../core/auth/auth.decorators';
import { RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { CartService } from '../application/cart.service';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(RealmGuard)
@RequireRealm('customer')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthPrincipal) {
    return this.cart.toDto({ customerId: user.sub });
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(AddCartItemSchema)) dto: AddCartItemInput,
  ) {
    return this.cart.addItem({ customerId: user.sub }, dto);
  }

  @Delete('items/:productId')
  removeItem(@CurrentUser() user: AuthPrincipal, @Param('productId') productId: string) {
    return this.cart.removeItem({ customerId: user.sub }, productId);
  }

  @Post('prescriptions')
  link(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(LinkPrescriptionsSchema)) dto: LinkPrescriptionsInput,
  ) {
    return this.cart.linkPrescriptions(user.sub, dto.prescriptionIds);
  }

  @Post('merge')
  merge(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(MergeCartSchema)) dto: MergeCartInput,
  ) {
    return this.cart.merge(dto.anonId, user.sub);
  }
}

@ApiTags('cart')
@Controller('cart/anonymous')
export class AnonymousCartController {
  constructor(private readonly cart: CartService) {}

  @Public()
  @Get()
  get(@Query(new ZodValidationPipe(AnonymousCartSchema)) query: AnonymousCartInput) {
    return this.cart.toDto({ anonId: query.anonId });
  }

  @Public()
  @Post('items')
  addItem(@Body(new ZodValidationPipe(AnonymousAddCartItemSchema)) dto: AnonymousAddCartItemInput) {
    const { anonId, ...item } = dto;
    return this.cart.addItem({ anonId }, item);
  }

  @Public()
  @Delete('items/:productId')
  removeItem(
    @Param('productId') productId: string,
    @Query(new ZodValidationPipe(AnonymousCartSchema)) query: AnonymousCartInput,
  ) {
    return this.cart.removeItem({ anonId: query.anonId }, productId);
  }
}
