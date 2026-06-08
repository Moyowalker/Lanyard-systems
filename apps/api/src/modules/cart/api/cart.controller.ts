import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AddCartItemInput,
  AddCartItemSchema,
  LinkPrescriptionsInput,
  LinkPrescriptionsSchema,
} from '@lanyard/contracts';

import { CurrentUser, RequireRealm } from '../../../core/auth/auth.decorators';
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
    return this.cart.toDto(user.sub);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(AddCartItemSchema)) dto: AddCartItemInput,
  ) {
    return this.cart.addItem(user.sub, dto);
  }

  @Delete('items/:productId')
  removeItem(@CurrentUser() user: AuthPrincipal, @Param('productId') productId: string) {
    return this.cart.removeItem(user.sub, productId);
  }

  @Post('prescriptions')
  link(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(LinkPrescriptionsSchema)) dto: LinkPrescriptionsInput,
  ) {
    return this.cart.linkPrescriptions(user.sub, dto.prescriptionIds);
  }
}
