import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/** Tap refund object — https://developers.tap.company/reference/refunds */
export interface RawTapRefund {
  id?: string
  object?: string
  charge_id?: string
  amount?: number | string
  currency?: string
  status?: string
  reason?: string | null
  created?: string | number
  date?: string | number
  reference?: { id?: string; gateway?: string; payment?: string; acquirer?: string }
  response?: { code?: string; message?: string }
  metadata?: Record<string, unknown>
  transaction?: {
    amount?: number | string
    currency?: string
    date?: { created?: number; completed?: number }
  }
  [k: string]: unknown
}

/**
 * Tap refund statuses:
 *   PENDING, ACCEPTED, REFUNDED, DECLINED, REJECTED, FAILED, RESTRICTED,
 *   TIMED_OUT, UNKNOWN.
 */
function mapStatus(raw: RawTapRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'REFUNDED':
      return 'succeeded'
    case 'PENDING':
    case 'ACCEPTED':
      return 'pending'
    case 'DECLINED':
    case 'REJECTED':
    case 'FAILED':
    case 'RESTRICTED':
    case 'TIMED_OUT':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawTapRefund): Refund {
  const currency = pickCurrency(raw.currency)
  const failed = ['DECLINED', 'REJECTED', 'FAILED', 'RESTRICTED', 'TIMED_OUT'].includes(
    (raw.status ?? '').toUpperCase(),
  )
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.charge_id ?? ''),
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw),
    failureReason: failed ? (raw.response?.message ?? undefined) : undefined,
    gateway: 'tap-payments',
    metadata: strMap({
      ...raw.metadata,
      reason: raw.reason,
      payment_reference: raw.reference?.payment,
      gateway_reference: raw.reference?.gateway,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.date ?? raw.created),
    raw,
  }
}
