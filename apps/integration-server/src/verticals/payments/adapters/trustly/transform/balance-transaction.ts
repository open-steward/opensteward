import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A Trustly balance-transaction is derived directly from an `AccountLedger`
 * row. The ledger reports every event that affects the merchant's Trustly
 * account balance — deposits, refunds, transaction fees, settlements, etc. —
 * making it a direct equivalent of the canonical BalanceTransaction resource.
 *
 * Field mapping:
 *   orderid / gluepayid  → id / externalId
 *   amount               → amount  (major-unit decimal → minor-unit integer)
 *   currency             → currency
 *   transactiontype      → type    (normalised to canonical slug)
 *   datestamp            → createdAt
 *
 * Docs: https://docs.trustly.com/api/accountledger
 */
export interface RawTrustlyLedgerRow {
  orderid?: string | number
  gluepayid?: string
  messageid?: string
  userid?: string
  accountname?: string
  datestamp?: string
  timestamp?: string
  transactiontype?: string
  amount?: string | number
  currency?: string
  [k: string]: unknown
}

function mapType(raw: RawTrustlyLedgerRow): BalanceTransactionType {
  const t = String(raw.transactiontype ?? '').toLowerCase()
  if (t === 'deposit' || t === 'credit') return 'charge'
  if (t === 'refund' || t === 'reversal') return 'refund'
  if (t.includes('fee')) return 'fee'
  if (t === 'chargeback') return 'dispute'
  if (t.includes('settlement') || t.includes('payout') || t.includes('withdrawal')) return 'payout'
  if (t.includes('adjustment')) return 'adjustment'
  return 'other'
}

export function transformBalanceTransaction(raw: RawTrustlyLedgerRow): BalanceTransaction {
  const id = String(raw.orderid ?? raw.gluepayid ?? raw.messageid ?? '')
  const grossAmount = toMinorUnits(raw.amount)
  const type = mapType(raw)
  return {
    id,
    externalId: id,
    type,
    amount: grossAmount,
    currency: pickCurrency(raw.currency),
    net: grossAmount, // Trustly ledger rows carry net amounts; fee is not broken out separately
    sourceId: id || undefined,
    sourceType: type,
    gateway: 'trustly',
    metadata: strMap({
      transactiontype: raw.transactiontype,
      accountname: raw.accountname,
      userid: raw.userid,
      messageid: raw.messageid,
      gluepayid: raw.gluepayid,
    }),
    createdAt: toIsoDatetime(raw.datestamp ?? raw.timestamp),
    raw,
  }
}
