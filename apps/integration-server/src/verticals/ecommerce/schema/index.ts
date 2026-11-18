/**
 * Canonical schema barrel — the OpenAPI generator walks this file's exports
 * and emits one `components.schemas` entry per Zod schema it finds. Every Zod
 * object schema must be re-exported here to appear in docs.
 */

// Shared primitives
export { MoneySchema, AddressSchema, AttachmentSchema, ImageSchema } from './shared'
export type { Money, Address, Attachment, Image } from './shared'

// Products + variants
export {
  ProductSchema,
  ProductVariantSchema,
  ProductOptionSchema,
  ProductStatusSchema,
  WeightUnitSchema,
} from './product'
export type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from './product'

// Collections
export { CollectionSchema, CollectionTypeSchema } from './collection'
export type { Collection, CollectionType } from './collection'

// Locations
export { LocationSchema } from './location'
export type { Location } from './location'

// Inventory
export { InventoryLevelSchema } from './inventory'
export type { InventoryLevel } from './inventory'

// Customers
export { CustomerSchema } from './customer'
export type { Customer } from './customer'

// Orders + line items
export {
  OrderSchema,
  LineItemSchema,
  TaxLineSchema,
  OrderFinancialStatusSchema,
  OrderFulfillmentStatusSchema,
} from './order'
export type {
  Order,
  LineItem,
  TaxLine,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from './order'

// Fulfillments
export {
  FulfillmentSchema,
  FulfillmentLineItemSchema,
  FulfillmentStatusSchema,
} from './fulfillment'
export type {
  Fulfillment,
  FulfillmentLineItem,
  FulfillmentStatus,
} from './fulfillment'

// Refunds
export { RefundSchema, RefundLineItemSchema } from './refund'
export type { Refund, RefundLineItem } from './refund'

// Transactions
export {
  TransactionSchema,
  TransactionKindSchema,
  TransactionStatusSchema,
} from './transaction'
export type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from './transaction'

// Discounts
export {
  DiscountSchema,
  DiscountTypeSchema,
  DiscountAppliesToSchema,
  DiscountCustomerEligibilitySchema,
} from './discount'
export type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
  DiscountCustomerEligibility,
} from './discount'

// Webhooks
export {
  WebhookEventSchema,
  WebhookResourceTypeSchema,
  WebhookActionSchema,
} from './webhook'
export type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from './webhook'
