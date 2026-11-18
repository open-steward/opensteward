/**
 * Canonical schema barrel for the payments vertical. The OpenAPI generator
 * walks every Zod schema exported from this file and registers it under
 * `components.schemas`. Always re-export new schemas here.
 */

// Shared primitives
export { MoneySchema, AddressSchema } from './shared'
export type { Money, Address } from './shared'

// Customers
export { CustomerSchema } from './customer'
export type { Customer } from './customer'

// Payment methods
export { PaymentMethodSchema, PaymentMethodTypeSchema } from './payment-method'
export type { PaymentMethod, PaymentMethodType } from './payment-method'

// Charges
export { ChargeSchema, ChargeStatusSchema } from './charge'
export type { Charge, ChargeStatus } from './charge'

// Refunds
export { RefundSchema, RefundStatusSchema, RefundReasonSchema } from './refund'
export type { Refund, RefundStatus, RefundReason } from './refund'

// Subscriptions
export {
  SubscriptionSchema,
  SubscriptionStatusSchema,
  SubscriptionItemSchema,
  CollectionMethodSchema,
} from './subscription'
export type {
  Subscription,
  SubscriptionStatus,
  SubscriptionItem,
  CollectionMethod,
} from './subscription'

// Invoices + line items
export { InvoiceSchema, InvoiceLineItemSchema, InvoiceStatusSchema } from './invoice'
export type { Invoice, InvoiceLineItem, InvoiceStatus } from './invoice'

// Payouts
export { PayoutSchema, PayoutStatusSchema, PayoutMethodSchema } from './payout'
export type { Payout, PayoutStatus, PayoutMethod } from './payout'

// Disputes
export { DisputeSchema, DisputeStatusSchema, DisputeReasonSchema } from './dispute'
export type { Dispute, DisputeStatus, DisputeReason } from './dispute'

// Plans / prices / products (optional catalog)
export { PlanSchema, PriceSchema, ProductSchema, BillingIntervalSchema } from './plan'
export type { Plan, Price, Product, BillingInterval } from './plan'

// Balance transactions (optional)
export { BalanceTransactionSchema, BalanceTransactionTypeSchema, FeeSchema } from './balance-transaction'
export type { BalanceTransaction, BalanceTransactionType, Fee } from './balance-transaction'

// Webhook envelope
export {
  WebhookEventSchema,
  WebhookResourceTypeSchema,
  WebhookActionSchema,
} from './webhook'
export type { WebhookEvent, WebhookResourceType, WebhookAction } from './webhook'
