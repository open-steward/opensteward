/**
 * Field classification for every listable ecommerce resource — see
 * docs/security/data-classification.md.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  CollectionSchema,
  CustomerSchema,
  DiscountSchema,
  FulfillmentSchema,
  InventoryLevelSchema,
  LocationSchema,
  OrderSchema,
  ProductSchema,
  ProductVariantSchema,
  RefundSchema,
  TransactionSchema,
} from './index'

export const RESOURCE_SCHEMAS = {
  products: ProductSchema,
  variants: ProductVariantSchema,
  collections: CollectionSchema,
  locations: LocationSchema,
  inventory_levels: InventoryLevelSchema,
  customers: CustomerSchema,
  orders: OrderSchema,
  fulfillments: FulfillmentSchema,
  refunds: RefundSchema,
  transactions: TransactionSchema,
  discounts: DiscountSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  products: {
    '*': R.internal,
    'variants[].price': R.financial,
    'variants[].compareAtPrice': R.financial,
  },
  variants: { '*': R.internal, price: R.financial, compareAtPrice: R.financial },
  collections: { '*': R.internal },
  // The merchant's own store / warehouse — business contact data
  // (allow-listed in scripts/check-field-classification.ts).
  locations: { '*': R.internal },
  inventory_levels: { '*': R.internal },
  customers: {
    '*': R.internal,
    email: R.piiEmail,
    firstName: R.piiName,
    lastName: R.piiName,
    phone: R.piiPhone,
    defaultAddress: R.piiAddress,
    addresses: R.piiAddress,
    totalSpent: R.financial,
  },
  orders: {
    '*': R.internal,
    email: R.piiEmail,
    phone: R.piiPhone,
    billingAddress: R.piiAddress,
    shippingAddress: R.piiAddress,
    note: R.pii,
    subtotalPrice: R.financial,
    totalTax: R.financial,
    totalDiscounts: R.financial,
    totalShipping: R.financial,
    totalPrice: R.financial,
    'lineItems[].price': R.financial,
    'lineItems[].totalDiscount': R.financial,
    'lineItems[].taxLines': R.financial,
  },
  fulfillments: { '*': R.internal },
  refunds: {
    '*': R.internal,
    amount: R.financial,
    reason: R.pii,
    note: R.pii,
    'refundLineItems[].amount': R.financial,
  },
  transactions: { '*': R.internal, amount: R.financial, authorizationCode: R.pii },
  discounts: { '*': R.internal, value: R.financial, minimumPurchaseAmount: R.financial },
}
