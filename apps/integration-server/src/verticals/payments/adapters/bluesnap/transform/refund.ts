import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, toMinorUnits } from './shared'

/**
 * BlueSnap does not expose refunds as a first-class, listable resource —
 * they live as sub-objects on a transaction (`refunds.refund[]`) and the
 * refund request returns the updated transaction. We synthesise a canonical
 * Refund from the refund entry plus the parent transaction context.
 *
 * BlueSnap refunds are processed synchronously, so a 200 response means the
 * refund succeeded.
 *
 * Docs: https://developers.bluesnap.com/v8976-JSON/reference/refund
 */
export interface RawBluesnapRefund {
  refundTransactionId?: string | number
  transactionId?: string | number
  amount?: number | string
  currency?: string
  reason?: string
  date?: string
  [k: string]: unknown
}

const REASON_MAP: Record<string, Refund['reason']> = {
  customer_request: 'requested_by_customer',
  requested_by_customer: 'requested_by_customer',
  duplicate: 'duplicate',
  fraudulent: 'fraudulent',
  fraud: 'fraudulent',
}

function mapReason(reason: string | undefined): Refund['reason'] {
  if (!reason) return undefined
  return REASON_MAP[reason.toLowerCase()] ?? 'other'
}

export function transformRefund(raw: RawBluesnapRefund): Refund {
  const id = String(raw.refundTransactionId ?? raw.transactionId ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.transactionId ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: 'succeeded',
    reason: mapReason(raw.reason),
    gateway: 'bluesnap',
    metadata: {},
    createdAt: toIsoDatetime(raw.date),
    updatedAt: toIsoDatetime(raw.date),
    raw,
  }
}
