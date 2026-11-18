/**
 * Maps a Nexi Checkout (Nets Easy) **refund** onto the canonical `Refund`.
 *
 * A refund is created against a charge (`POST /v1/charges/{chargeId}/refunds`)
 * and can be read back via `GET /v1/refunds/{refundId}`. The amount lives in
 * the `{ amount, currency }` envelope; `state` is one of `Pending` / `Cancelled`
 * / `Completed` / `Failed` (a.k.a. `Expired`).
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toIsoDatetime, type NexiAmount } from './shared'

export interface RawNexiRefund {
  refundId?: string
  /** Charge the refund was issued against (echoed by some responses). */
  chargeId?: string
  /** Payment the refund belongs to (webhook payloads carry this). */
  paymentId?: string
  amount?: NexiAmount
  state?: string
  lastUpdated?: string
  created?: string
  invoiceDetails?: { invoiceNumber?: string }
  [k: string]: unknown
}

function mapStatus(state: string | undefined): RefundStatus {
  switch ((state ?? '').toLowerCase()) {
    case 'completed':
      return 'succeeded'
    case 'pending':
    case 'initiated':
      return 'pending'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
    case 'expired':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawNexiRefund): Refund {
  const id = raw.refundId ?? ''
  return {
    id: String(id),
    externalId: String(id),
    chargeId: String(raw.chargeId ?? raw.paymentId ?? ''),
    amount: raw.amount?.amount ?? 0,
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw.state),
    receiptNumber: raw.invoiceDetails?.invoiceNumber,
    gateway: 'nexi',
    metadata: strMap({ paymentId: raw.paymentId, state: raw.state }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.lastUpdated ?? raw.created),
    raw,
  }
}
