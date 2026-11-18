/**
 * Dodo Payments `Payment` → canonical `Charge`.
 *
 * Dodo amounts are integer minor units. The list shape exposes `total_amount`;
 * the detail shape additionally carries `settlement_amount`, `tax`, card
 * fields, refund/dispute status, and an embedded limited-customer object.
 *
 * IntentStatus values:
 *   succeeded, failed, cancelled, processing,
 *   requires_customer_action, requires_merchant_action,
 *   requires_payment_method, requires_confirmation, requires_capture,
 *   partially_captured, partially_captured_and_capturable
 *
 * Docs: https://docs.dodopayments.com/api-reference/payments/get-payments
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap } from './shared'

export interface RawDodoCustomerLimited {
  customer_id?: string
  name?: string
  email?: string
  phone_number?: string | null
}

export interface RawDodoPayment {
  payment_id?: string
  business_id?: string
  brand_id?: string
  total_amount?: number
  settlement_amount?: number
  tax?: number
  currency?: string
  status?: string
  customer?: RawDodoCustomerLimited
  subscription_id?: string | null
  payment_method?: string | null
  payment_method_type?: string | null
  card_last_four?: string | null
  card_network?: string | null
  refund_status?: string | null
  dispute_status?: string | null
  error_code?: string | null
  error_message?: string | null
  invoice_id?: string | null
  payment_link?: string | null
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawDodoPayment): ChargeStatus {
  const status = (raw.status ?? '').toLowerCase()
  const refund = (raw.refund_status ?? '').toLowerCase()
  if (raw.dispute_status) return 'disputed'
  if (refund === 'full') return 'refunded'
  if (refund === 'partial') return 'partially_refunded'
  switch (status) {
    case 'succeeded':
    case 'partially_captured':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'processing':
    case 'requires_customer_action':
    case 'requires_merchant_action':
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_capture':
    case 'partially_captured_and_capturable':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawDodoPayment): Charge {
  const captured = (raw.status ?? '').toLowerCase() === 'succeeded'
  return {
    id: String(raw.payment_id ?? ''),
    externalId: String(raw.payment_id ?? ''),
    amount: raw.total_amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    captured,
    customerId: raw.customer?.customer_id ?? undefined,
    paymentMethodId: raw.payment_method ?? undefined,
    invoiceId: raw.invoice_id ?? undefined,
    subscriptionId: raw.subscription_id ?? undefined,
    failureCode: raw.error_code ?? undefined,
    failureMessage: raw.error_message ?? undefined,
    receiptUrl: raw.payment_link ?? undefined,
    receiptEmail: raw.customer?.email ?? undefined,
    gateway: 'dodo-payments',
    metadata: strMap({
      ...raw.metadata,
      payment_method_type: raw.payment_method_type,
      card_last_four: raw.card_last_four,
      card_network: raw.card_network,
      brand_id: raw.brand_id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.created_at),
    raw,
  }
}
