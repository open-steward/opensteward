/**
 * Chargebee `Transaction` → canonical `Charge`. Chargebee sits on top of an
 * underlying gateway (Stripe / Adyen / Braintree / Razorpay / Authorize.Net);
 * we surface that as `metadata.processor` so consumers can dedupe with
 * `Charge.gateway = 'stripe'` if the operator has both Chargebee and the
 * underlying gateway configured.
 */
import { requireAmount } from '@opensteward/shared'

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawChargebeeTransaction {
  id?: string
  type?: string
  status?: string
  amount?: number
  currency_code?: string
  customer_id?: string
  payment_source_id?: string
  payment_method?: string
  subscription_id?: string
  invoice_id?: string
  gateway?: string
  reference_number?: string
  date?: number
  refunded_at?: number
  error_code?: string
  error_text?: string
  [k: string]: unknown
}

function mapStatus(raw: RawChargebeeTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return raw.type === 'refund' ? 'refunded' : 'succeeded'
    case 'in_progress':
    case 'needs_attention':
      return 'pending'
    case 'failure':
    case 'timeout':
      return 'failed'
    case 'voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawChargebeeTransaction): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: requireAmount(raw.amount, 'chargebee charge'),
    currency: pickCurrency(raw.currency_code),
    status: mapStatus(raw),
    customerId: raw.customer_id,
    paymentMethodId: raw.payment_source_id,
    subscriptionId: raw.subscription_id,
    invoiceId: raw.invoice_id,
    failureCode: raw.error_code,
    failureMessage: raw.error_text,
    gateway: 'chargebee',
    metadata: strMap({
      processor: raw.gateway,
      payment_method: raw.payment_method,
      reference_number: raw.reference_number,
      type: raw.type,
    }),
    createdAt: toIso(raw.date),
    updatedAt: toIso(raw.refunded_at),
    raw,
  }
}
