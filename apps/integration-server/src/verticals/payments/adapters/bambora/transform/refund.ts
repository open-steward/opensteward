import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { isApproved, pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A Bambora return (refund) is itself a transaction record produced by
 * `POST /payments/{id}/returns`. It carries the same shape as a payment, with
 * `type: 'R'`, plus a back-reference to the original payment id.
 *
 *   - `id`                    the return transaction's own id
 *   - `original_transaction`  the id of the payment being returned (echoed in
 *                             the `links` on some responses; we also accept the
 *                             charge id supplied by the caller)
 *   - `amount`                major-unit decimal
 */
export interface RawBamboraReturn {
  id?: number | string
  trn_id?: number | string
  original_transaction?: number | string
  approved?: number | string
  message_id?: number | string
  message?: string
  created?: string
  order_number?: string
  type?: string
  amount?: number | string
  currency?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawBamboraReturn, chargeId?: string): Refund {
  const id = String(raw.id ?? raw.trn_id ?? '')
  const approved = isApproved(raw.approved)
  return {
    id,
    externalId: id,
    chargeId: chargeId ?? String(raw.original_transaction ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: approved ? 'succeeded' : 'failed',
    failureReason: approved ? undefined : raw.message,
    gateway: 'bambora',
    metadata: strMap({
      order_number: raw.order_number,
      type: raw.type,
      message_id: raw.message_id,
      message: raw.message,
    }),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
