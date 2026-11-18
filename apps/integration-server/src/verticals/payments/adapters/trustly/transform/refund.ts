import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Trustly refunds are created with the `Refund` method against the original
 * `OrderID`; the funds always return to the bank account used for the original
 * deposit. The synchronous result is a thin `{ result, orderid }` hash, while
 * an `AccountLedger` row of `transactiontype` "refund" carries the settled
 * `amount` / `currency` / `datestamp`. Both are normalised here.
 *
 * Trustly has no partial-state machine for refunds in the classic API: a
 * returned `result` of `"1"` means accepted, anything else means it did not go
 * through.
 */
export interface RawTrustlyRefund {
  orderid?: string | number
  result?: string | number
  /** AccountLedger / notification fields. */
  amount?: string | number
  currency?: string
  datestamp?: string
  timestamp?: string
  messageid?: string
  gluepayid?: string
  transactiontype?: string
  /** The order the refund was issued against (when echoed back). */
  refundorderid?: string | number
  [k: string]: unknown
}

export function transformRefund(raw: RawTrustlyRefund): Refund {
  const id = String(raw.orderid ?? raw.gluepayid ?? '')
  const accepted = String(raw.result ?? '').trim() === '1'
  return {
    id,
    externalId: id,
    chargeId: String(raw.refundorderid ?? raw.orderid ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: accepted ? 'succeeded' : 'pending',
    gateway: 'trustly',
    metadata: strMap({
      messageid: raw.messageid,
      gluepayid: raw.gluepayid,
      transactiontype: raw.transactiontype,
      result: raw.result,
    }),
    createdAt: toIsoDatetime(raw.datestamp ?? raw.timestamp),
    raw,
  }
}
