import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { moneyOf, requireId, resultGroup, strMap, type RawPeachTransaction } from './shared'

export type RawPeachRefund = RawPeachTransaction

function refundStatus(code: string | undefined): RefundStatus {
  const g = resultGroup(code)
  return g === 'chargeback' ? 'unknown' : g
}

/**
 * An RF (refund) record of GET /v3/query. The charge it refunds is
 * `referencedId`: "In case of referenced payment (for example, capture or
 * refund), use this field to see which payment the system referenced."
 * https://developer.peachpayments.com/docs/oppwa-references-api
 * A refund without it has no documented link to its charge, and `chargeId`
 * is required, so the record throws.
 */
export function transformRefund(raw: RawPeachRefund): Refund {
  const id = requireId(raw, 'refund')
  const chargeId = raw.referencedId
  if (typeof chargeId !== 'string' || chargeId.length === 0) {
    throw new Error(`Peach Payments refund ${id}: record has no referencedId naming its charge`)
  }
  const { amount, currency } = moneyOf(raw, 'refund')
  const status = refundStatus(raw.result?.code)
  return {
    id,
    externalId: id,
    chargeId,
    amount,
    currency,
    status,
    failureReason: status === 'failed' ? raw.result?.description : undefined,
    gateway: 'peach-payments',
    metadata: strMap(raw.customParameters),
    createdAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
