import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A Trustly charge is sourced from two related shapes:
 *
 *  - the synchronous `Deposit` result (`{ orderid, url }`) returned when a
 *    checkout is opened — at that point the payment is merely `pending`; and
 *  - an `AccountLedger` row whose `transactiontype` is a deposit/credit, which
 *    is the settled, money-received view (with `datestamp`, `amount`,
 *    `currency`).
 *
 * Both are normalised to the canonical `Charge`. Field names are Trustly's
 * lower-cased wire keys; amounts arrive as major-unit decimal strings.
 */
export interface RawTrustlyCharge {
  orderid?: string | number
  url?: string
  messageid?: string
  enduserid?: string
  /** AccountLedger fields. */
  amount?: string | number
  currency?: string
  datestamp?: string
  transactiontype?: string
  accountname?: string
  gluepayid?: string
  userid?: string
  /** Notification fields. */
  notificationid?: string
  timestamp?: string
  [k: string]: unknown
}

function mapStatus(raw: RawTrustlyCharge): ChargeStatus {
  const type = String(raw.transactiontype ?? '').toLowerCase()
  // A settled ledger deposit/credit row means money received → succeeded.
  if (type === 'deposit' || type === 'credit') return 'succeeded'
  if (type === 'refund' || type === 'reversal') return 'refunded'
  if (type === 'chargeback') return 'disputed'
  // A bare Deposit result (orderid + checkout url, no ledger row yet) is pending.
  return 'pending'
}

export function transformCharge(raw: RawTrustlyCharge): Charge {
  const id = String(raw.orderid ?? raw.gluepayid ?? raw.messageid ?? '')
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    customerId: raw.enduserid ? String(raw.enduserid) : undefined,
    receiptUrl: raw.url,
    gateway: 'trustly',
    metadata: strMap({
      messageid: raw.messageid,
      enduserid: raw.enduserid,
      transactiontype: raw.transactiontype,
      accountname: raw.accountname,
      gluepayid: raw.gluepayid,
      userid: raw.userid,
      notificationid: raw.notificationid,
    }),
    createdAt: toIsoDatetime(raw.datestamp ?? raw.timestamp),
    raw,
  }
}
