/**
 * Chargebee `Transaction` (type = "refund") → canonical `Refund`.
 *
 * Chargebee models refunds as transaction records.  The originating payment
 * transaction id is surfaced under `linked_refunds[0].txn_id` on the payment
 * side, but when reading the refund transaction directly, the field
 * `reference_number` often carries the gateway-level refund reference while
 * `linked_refunds` may carry the payment transaction id.  We use
 * `linked_refunds[0].txn_id` as `chargeId` when present, falling back to an
 * empty string (callers can join via invoiceId / subscriptionId if needed).
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawChargebeeRefund {
  id?: string
  type?: string
  status?: string
  amount?: number
  amount_unused?: number
  currency_code?: string
  customer_id?: string
  subscription_id?: string
  invoice_id?: string
  gateway?: string
  payment_method?: string
  reference_number?: string
  date?: number
  updated_at?: number
  error_code?: string
  error_text?: string
  linked_refunds?: Array<{ txn_id?: string; applied_amount?: number }>
  [k: string]: unknown
}

function mapStatus(raw: RawChargebeeRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return 'succeeded'
    case 'failure':
    case 'timeout':
      return 'failed'
    case 'voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawChargebeeRefund): Refund {
  const linkedPaymentId = raw.linked_refunds?.[0]?.txn_id ?? ''

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: linkedPaymentId,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency_code),
    status: mapStatus(raw),
    failureReason: raw.error_text ?? undefined,
    gateway: 'chargebee',
    metadata: strMap({
      processor: raw.gateway,
      payment_method: raw.payment_method,
      reference_number: raw.reference_number,
      customer_id: raw.customer_id,
      subscription_id: raw.subscription_id,
      invoice_id: raw.invoice_id,
      error_code: raw.error_code,
    }),
    createdAt: toIso(raw.date),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
