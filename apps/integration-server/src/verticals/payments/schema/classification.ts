/**
 * Field classification for every listable payments resource — see
 * docs/security/data-classification.md. `raw` and `metadata` (the upstream
 * payload) are implicit PII; `stripRawPayload` removes `raw` entirely when the
 * vertical's payload flag is off.
 */
import { FIELD_RULES as R, type ResourceClassification } from '@opensteward/shared'
import {
  BalanceTransactionSchema,
  ChargeSchema,
  CustomerSchema,
  DisputeSchema,
  InvoiceSchema,
  PaymentMethodSchema,
  PayoutSchema,
  PlanSchema,
  PriceSchema,
  ProductSchema,
  RefundSchema,
  SubscriptionSchema,
} from './index'

export const RESOURCE_SCHEMAS = {
  customers: CustomerSchema,
  payment_methods: PaymentMethodSchema,
  charges: ChargeSchema,
  refunds: RefundSchema,
  subscriptions: SubscriptionSchema,
  invoices: InvoiceSchema,
  payouts: PayoutSchema,
  disputes: DisputeSchema,
  plans: PlanSchema,
  prices: PriceSchema,
  products: ProductSchema,
  balance_transactions: BalanceTransactionSchema,
}

export const CLASSIFICATION: Record<string, ResourceClassification> = {
  customers: {
    '*': R.internal,
    email: R.piiEmail,
    name: R.piiName,
    phone: R.piiPhone,
    billingAddress: R.piiAddress,
    shippingAddress: R.piiAddress,
    description: R.pii,
    balance: R.financial,
  },
  payment_methods: {
    '*': R.internal,
    holderName: R.piiName,
    expMonth: R.pii,
    expYear: R.pii,
    // Joinable across records without revealing the card.
    fingerprint: R.piiHmac,
  },
  charges: {
    '*': R.internal,
    amount: R.financial,
    amountRefunded: R.financial,
    amountCaptured: R.financial,
    receiptEmail: R.piiEmail,
    receiptUrl: R.pii,
    description: R.pii,
  },
  refunds: { '*': R.internal, amount: R.financial },
  subscriptions: { '*': R.internal, 'items[].amount': R.financial },
  invoices: {
    '*': R.internal,
    subtotal: R.financial,
    tax: R.financial,
    total: R.financial,
    amountDue: R.financial,
    amountPaid: R.financial,
    amountRemaining: R.financial,
    // Tokenised links that open the invoice (with the customer's details).
    hostedInvoiceUrl: R.pii,
    invoicePdfUrl: R.pii,
  },
  payouts: { '*': R.internal, amount: R.financial, destinationLast4: R.pii },
  disputes: { '*': R.internal, amount: R.financial },
  plans: { '*': R.internal, amount: R.financial },
  prices: { '*': R.internal, unitAmount: R.financial },
  products: { '*': R.internal },
  balance_transactions: {
    '*': R.internal,
    amount: R.financial,
    fee: R.financial,
    net: R.financial,
    'feeDetails[].amount': R.financial,
    description: R.pii,
  },
}
