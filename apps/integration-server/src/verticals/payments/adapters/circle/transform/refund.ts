import type { Refund, RefundStatus } from '../../../schema/refund'
import { type CircleMoney, pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A Circle Mint refund is itself a payment object with `type: 'refund'`,
 * returned by `POST /v1/payments/{id}/refund`. The refund record does not echo
 * back the parent payment id, so the adapter threads it in as `chargeId`.
 *
 * Docs: https://developers.circle.com/circle-mint/crypto-refunds
 */
export interface RawCircleRefund {
  id?: string
  type?: 'refund'
  amount?: CircleMoney
  fees?: CircleMoney
  status?: string
  errorCode?: string
  createDate?: string
  updateDate?: string
  [k: string]: unknown
}

/** Map a Circle refund `status` onto the canonical {@link RefundStatus}. */
function mapStatus(raw: RawCircleRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
    case 'confirmed':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawCircleRefund, chargeId: string): Refund {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    chargeId,
    amount: toMinorUnits(raw.amount?.amount) ?? 0,
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    failureReason: raw.errorCode,
    gateway: 'circle',
    metadata: strMap({ fee: raw.fees?.amount }),
    createdAt: toIsoDatetime(raw.createDate),
    updatedAt: toIsoDatetime(raw.updateDate),
    raw,
  }
}
