/**
 * Rebilly transaction of type `refund` → canonical Refund.
 *
 * Transaction.yaml: `parentTransactionId` "ID of the parent transaction.";
 * the refund operation is POST /transactions/{id}/refund (PostTransactionRefund).
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import type { RawRebillyTransaction } from './charge'
import { requireId, requireMoney, str, strMap } from './shared'

const PENDING = new Set([
  'pending',
  'sending',
  'offsite',
  'waiting-approval',
  'waiting-gateway',
  'waiting-refund',
])

function mapStatus(status: string | undefined, result: string | undefined): RefundStatus {
  if (result === 'declined') return 'failed'
  if (result === 'canceled' || result === 'abandoned' || status === 'voided') return 'cancelled'
  if (status === 'completed') return result === 'approved' ? 'succeeded' : 'unknown'
  return status !== undefined && PENDING.has(status) ? 'pending' : 'unknown'
}

export function transformRefund(raw: RawRebillyTransaction): Refund {
  const id = requireId(raw.id, 'refund transaction id')
  const money = requireMoney(raw.amount, raw.currency, `refund transaction ${id}`)
  return {
    id,
    externalId: id,
    chargeId: requireId(raw.parentTransactionId, `refund transaction ${id} parentTransactionId`),
    amount: money.amount,
    currency: money.currency,
    status: mapStatus(raw.status, raw.result),
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
