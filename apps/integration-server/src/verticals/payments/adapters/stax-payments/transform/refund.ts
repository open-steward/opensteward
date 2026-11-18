import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { mapTransactionStatus, type RawStaxTransaction } from './charge'
import { majorNumber, optStr, requiredId } from './shared'

export type RawStaxRefund = RawStaxTransaction

/**
 * A Stax refund is a transaction of type `refund`: "A refund creates a child
 * transaction with type = refund, linked to the original transaction via the
 * reference_id." (https://docs.staxpayments.com/reference/refund-transaction)
 */
export function transformRefund(raw: RawStaxRefund, currency: string): Refund {
  const id = requiredId(raw.id, 'refund transaction')
  const chargeId = optStr(raw.reference_id)
  if (chargeId === undefined) throw new Error(`Stax Payments refund ${id} has no reference_id`)
  const total = majorNumber(raw.total)
  if (total === undefined) throw new Error(`Stax Payments refund ${id} has no total`)
  const status = mapTransactionStatus(raw.status)
  return {
    id,
    externalId: id,
    chargeId,
    amount: majorToMinor(total, currency),
    currency,
    status,
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
