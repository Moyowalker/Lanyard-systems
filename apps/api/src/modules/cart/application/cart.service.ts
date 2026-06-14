import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AddCartItemInput,
  CartDto,
  CartLineDto,
  Currency,
  ErrorCode,
  ProductStatus,
} from '@lanyard/contracts';

import { Cart } from '../infrastructure/cart.schema';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { PricingService } from '../../pricing/application/pricing.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { DomainError } from '../../../core/errors/domain-error';

export interface ResolvedLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceKobo?: number;
  lineTotalKobo?: number;
  requiresPrescription: boolean;
  inStock: boolean;
  available: number;
}
export interface ResolvedCart {
  cartId: string;
  branchId?: string;
  lines: ResolvedLine[];
  prescriptionIds: string[];
  subtotalKobo: number;
  requiresRxVerification: boolean;
}

type CartOwner = { customerId: string } | { anonId: string };

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<Cart>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
  ) {}

  private ownerFilter(owner: CartOwner) {
    return 'customerId' in owner
      ? { customerId: new Types.ObjectId(owner.customerId) }
      : { anonId: owner.anonId };
  }

  private ownerCreate(owner: CartOwner) {
    return 'customerId' in owner
      ? { customerId: new Types.ObjectId(owner.customerId) }
      : { anonId: owner.anonId };
  }

  private async getOrCreate(owner: CartOwner) {
    let cart = await this.cartModel.findOne(this.ownerFilter(owner));
    if (!cart) cart = await this.cartModel.create({ ...this.ownerCreate(owner), items: [] });
    return cart;
  }

  async addItem(owner: CartOwner, input: AddCartItemInput): Promise<CartDto> {
    const product = await this.productModel.findOne({
      _id: new Types.ObjectId(input.productId),
      status: ProductStatus.PUBLISHED,
    });
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not available');

    const cart = await this.getOrCreate(owner);
    // Switching branch resets the basket (pricing/availability are per-branch).
    if (cart.branchId && cart.branchId.toString() !== input.branchId) {
      cart.items = [];
      cart.prescriptionIds = [];
    }
    cart.branchId = new Types.ObjectId(input.branchId);

    const existing = cart.items.find((i) => i.productId.toString() === input.productId);
    if (existing) existing.quantity = input.quantity;
    else
      cart.items.push({
        productId: new Types.ObjectId(input.productId),
        quantity: input.quantity,
        requiresPrescription: product.requiresPrescription,
      });
    await cart.save();
    return this.toDto(owner);
  }

  async removeItem(owner: CartOwner, productId: string): Promise<CartDto> {
    const cart = await this.getOrCreate(owner);
    cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
    await cart.save();
    return this.toDto(owner);
  }

  async linkPrescriptions(customerId: string, ids: string[]): Promise<CartDto> {
    const cart = await this.getOrCreate({ customerId });
    const set = new Set([...cart.prescriptionIds.map(String), ...ids]);
    cart.prescriptionIds = [...set].map((id) => new Types.ObjectId(id));
    await cart.save();
    return this.toDto({ customerId });
  }

  async toDto(owner: CartOwner): Promise<CartDto> {
    const r = await this.resolve(owner);
    const items: CartLineDto[] = r.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPriceKobo: l.unitPriceKobo,
      lineTotalKobo: l.lineTotalKobo,
      requiresPrescription: l.requiresPrescription,
      inStock: l.inStock,
      available: l.available,
    }));
    return {
      id: r.cartId,
      branchId: r.branchId,
      items,
      prescriptionIds: r.prescriptionIds,
      subtotalKobo: r.subtotalKobo,
      currency: Currency.NGN,
      requiresRxVerification: r.requiresRxVerification,
    };
  }

  /** Authoritative resolution: server-side prices, availability and Rx flags. */
  async resolve(owner: CartOwner): Promise<ResolvedCart> {
    const cart = await this.getOrCreate(owner);
    const branchId = cart.branchId?.toString();
    if (!branchId || cart.items.length === 0) {
      return {
        cartId: cart._id.toString(),
        branchId,
        lines: [],
        prescriptionIds: cart.prescriptionIds.map(String),
        subtotalKobo: 0,
        requiresRxVerification: false,
      };
    }

    const productIds = cart.items.map((i) => i.productId.toString());
    const [products, priceMap, availMap] = await Promise.all([
      this.productModel
        .find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id)) } })
        .lean(),
      this.pricing.getPriceMap(branchId, productIds),
      this.inventory.getAvailabilityMap(branchId, productIds),
    ]);
    const productById = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotalKobo = 0;
    let requiresRx = false;
    const lines: ResolvedLine[] = cart.items.map((item) => {
      const id = item.productId.toString();
      const product = productById.get(id);
      const price = priceMap.get(id);
      const available = availMap.get(id) ?? 0;
      const unit = price?.isAvailable ? price.priceKobo : undefined;
      const lineTotal = unit !== undefined ? unit * item.quantity : undefined;
      if (lineTotal) subtotalKobo += lineTotal;
      const reqRx = product?.requiresPrescription ?? item.requiresPrescription;
      if (reqRx) requiresRx = true;
      return {
        productId: id,
        name: product?.name ?? 'Unknown',
        quantity: item.quantity,
        unitPriceKobo: unit,
        lineTotalKobo: lineTotal,
        requiresPrescription: reqRx,
        inStock: available >= item.quantity,
        available,
      };
    });

    return {
      cartId: cart._id.toString(),
      branchId,
      lines,
      prescriptionIds: cart.prescriptionIds.map(String),
      subtotalKobo,
      requiresRxVerification: requiresRx,
    };
  }

  async clear(customerId: string): Promise<void> {
    await this.cartModel.updateOne(
      { customerId: new Types.ObjectId(customerId) },
      { $set: { items: [], prescriptionIds: [] }, $unset: { branchId: '' } },
    );
  }

  async merge(anonId: string, customerId: string): Promise<CartDto> {
    const guest = await this.cartModel.findOne({ anonId });
    if (!guest) return this.toDto({ customerId });

    const customerObjectId = new Types.ObjectId(customerId);
    let customer = await this.cartModel.findOne({ customerId: customerObjectId });
    if (!customer) {
      guest.customerId = customerObjectId;
      guest.anonId = undefined;
      await guest.save();
      return this.toDto({ customerId });
    }

    if (guest.branchId) {
      if (!customer.branchId || customer.branchId.toString() !== guest.branchId.toString()) {
        customer.branchId = guest.branchId;
        customer.items = [...guest.items];
        customer.prescriptionIds = [...guest.prescriptionIds];
      } else {
        const byProduct = new Map(customer.items.map((item) => [item.productId.toString(), item]));
        for (const item of guest.items) {
          const existing = byProduct.get(item.productId.toString());
          if (existing) existing.quantity = Math.min(existing.quantity + item.quantity, 99);
          else customer.items.push(item);
        }
        const prescriptionIds = new Set([
          ...customer.prescriptionIds.map(String),
          ...guest.prescriptionIds.map(String),
        ]);
        customer.prescriptionIds = [...prescriptionIds].map((id) => new Types.ObjectId(id));
      }
      await customer.save();
    }

    await this.cartModel.deleteOne({ _id: guest._id });
    return this.toDto({ customerId });
  }
}
