/**
 * Paddle `Transaction` → canonical `Charge`. Paddle is merchant-of-record:
 * `Charge.amount` = gross-of-tax (what the buyer paid). VAT/sales-tax sits
 * on the linked Invoice. Net-to-merchant = total - tax - paddle_fee,
 * computed by consumers if they need it.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, strToMinor } from './shared'

export interface RawPaddleTransaction {
  id?: string
  status?: string
  customer_id?: string
  subscription_id?: string
  invoice_id?: string
  origin?: string
  details?: {
    totals?: {
      grand_total?: string
      tax?: string
      total?: string
      subtotal?: string
    }
  }
  currency_code?: string
  payments?: Array<{ id?: string; status?: string; method_details?: { type?: string } }>
  created_at?: string
  updated_at?: string
  billed_at?: string
  custom_data?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawPaddleTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
    case 'paid':
      return 'succeeded'
    case 'billed':
    case 'ready':
    case 'draft':
      return 'pending'
    case 'past_due':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPaddleTransaction): Charge {
  const total = strToMinor(raw.details?.totals?.grand_total ?? raw.details?.totals?.total)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: total,
    currency: pickCurrency(raw.currency_code),
    status: mapStatus(raw),
    customerId: raw.customer_id,
    subscriptionId: raw.subscription_id,
    invoiceId: raw.invoice_id,
    paymentMethodId: raw.payments?.[0]?.id,
    gateway: 'paddle',
    metadata: strMap({
      ...raw.custom_data,
      origin: raw.origin,
      payment_method_type: raw.payments?.[0]?.method_details?.type,
      tax_amount: raw.details?.totals?.tax,
      // Paddle is merchant-of-record: `tax` is VAT/sales-tax remitted by
      // Paddle on the merchant's behalf. Charge.amount is gross-of-tax.
    }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
