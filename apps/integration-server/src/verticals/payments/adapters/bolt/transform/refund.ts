import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { pickCurrency, pickMoney, strMap, type BoltMoney } from './shared'

/**
 * A Bolt refund. In Bolt, a refund is a distinct transaction object that
 * references the original transaction via `transaction_reference`. `amount`
 * is integer minor units and may be flat or a nested `{ amount, currency }`.
 */
export interface RawBoltRefund {
  id?: string
  reference?: string
  /** The refund's own reference. */
  refund_reference?: string
  /** Reference of the parent (captured) transaction being refunded. */
  transaction_reference?: string
  status?: string
  amount?: BoltMoney
  currency?: string
  reason?: string
  failure_reason?: string
  date_created?: string
  created_at?: string
  date_refunded?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawBoltRefund): Refund['status'] {
  switch ((raw.status ?? '').toLowerCase().replace(/\s+/g, '_')) {
    case 'completed':
    case 'succeeded':
    case 'refunded':
      return 'succeeded'
    case 'failed':
    case 'failed_authorization':
    case 'rejected':
      return 'failed'
    case 'cancelled':
    case 'canceled':
    case 'voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawBoltRefund): Refund {
  const id = raw.refund_reference ?? raw.reference ?? raw.id ?? ''
  const money = pickMoney(raw.amount)
  return {
    id: String(id),
    externalId: String(id),
    chargeId: String(raw.transaction_reference ?? ''),
    amount: money.amount,
    currency: pickCurrency(money.currency ?? raw.currency),
    status: mapStatus(raw),
    failureReason: raw.failure_reason,
    gateway: 'bolt',
    metadata: strMap({ ...raw.metadata, reason: raw.reason }),
    createdAt: toIsoDatetime(raw.date_created ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.date_refunded),
    raw,
  }
}
