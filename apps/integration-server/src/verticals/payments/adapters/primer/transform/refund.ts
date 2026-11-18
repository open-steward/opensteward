/**
 * Primer Refund → canonical Refund.
 *
 * Primer has no standalone refund resource: `POST /payments/{id}/refund`
 * returns the updated **Payment** (`PaymentAPIResponse`) whose `transactions`
 * array now carries a `REFUND` entry. We synthesise a canonical Refund from
 * that payment — the refund amount is the payment's `amountRefunded`, the
 * `chargeId` is the payment id, and the refund transaction id (when present)
 * becomes the refund id, else we derive a stable `<paymentId>_refund` id.
 *
 * Money is already in integer **minor units** (no scaling). The refund's
 * transaction status maps onto the canonical refund-status set.
 *
 * Refs:
 *   https://primer.io/docs/api-reference/v2.2/api-reference/payments-api/refund-a-payment
 *   https://primer.io/docs/payments/refund-payments
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus, RefundReason } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawPrimerTransaction {
  transactionType?: string
  processorTransactionId?: string
  processorStatus?: string
  amount?: number
  currencyCode?: string
  date?: string
  [k: string]: unknown
}

export interface RawPrimerRefund {
  id?: string
  status?: string
  orderId?: string
  currencyCode?: string
  amount?: number
  amountRefunded?: number
  refundReason?: string
  reason?: string
  date?: string
  dateCreated?: string
  dateUpdated?: string
  metadata?: Record<string, unknown>
  transactions?: RawPrimerTransaction[]
  [k: string]: unknown
}

/** Map the refund transaction's status onto the canonical refund-status set. */
function mapStatus(raw: RawPrimerRefund, refundTxn: RawPrimerTransaction | undefined): RefundStatus {
  const status = (refundTxn?.processorStatus ?? raw.status ?? '').toUpperCase()
  switch (status) {
    case 'SETTLED':
    case 'SUCCESS':
    case 'SUCCEEDED':
      return 'succeeded'
    case 'DECLINED':
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
    case 'SETTLING':
      return 'pending'
    default:
      // The enclosing payment having a non-zero amountRefunded with no explicit
      // failure implies the refund settled.
      return (raw.amountRefunded ?? 0) > 0 ? 'succeeded' : 'pending'
  }
}

/** Map Primer's free-text refund reason onto the canonical closed set. */
function mapReason(reason: string | undefined): RefundReason | undefined {
  const r = (reason ?? '').toLowerCase()
  if (!r) return undefined
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('customer') || r.includes('requested')) return 'requested_by_customer'
  return 'other'
}

export function transformRefund(raw: RawPrimerRefund): Refund {
  const refundTxn = (raw.transactions ?? []).find(
    (t) => (t.transactionType ?? '').toUpperCase() === 'REFUND',
  )
  const refundId =
    refundTxn?.processorTransactionId ?? (raw.id ? `${raw.id}_refund` : '')
  const reason = raw.refundReason ?? raw.reason
  return {
    id: String(refundId),
    externalId: String(refundId),
    chargeId: String(raw.id ?? ''),
    amount: refundTxn?.amount ?? raw.amountRefunded ?? 0,
    currency: pickCurrency(refundTxn?.currencyCode ?? raw.currencyCode),
    status: mapStatus(raw, refundTxn),
    reason: mapReason(reason),
    gateway: 'primer',
    metadata: strMap({ ...raw.metadata, orderId: raw.orderId }),
    createdAt: toIsoDatetime(refundTxn?.date ?? raw.dateCreated ?? raw.date),
    updatedAt: toIsoDatetime(raw.dateUpdated),
    raw,
  }
}
