/**
 * Yoco API `PayoutEntry` (GET /v1/payouts/{payout_id}/payout_entries) to a
 * canonical BalanceTransaction. Yoco has no balance-transactions endpoint; a
 * payout entry is one line of money settled in a payout. Field names and enums
 * are from the `PayoutEntry` schema in
 * https://developer.yoco.com/openapi/yoco-api-reference.json. It documents no
 * timestamp, so `createdAt` is absent.
 */
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { readId, readMoney, stringFields, type RawYocoMoney } from './shared'

export interface RawYocoPayoutEntry {
  id: string
  payout_id: string
  type?: string
  gross_amount: RawYocoMoney
  fee_amount?: RawYocoMoney
  net_amount?: RawYocoMoney
  client_transaction_id?: string | null
  [k: string]: unknown
}

/**
 * `PayoutEntryType`:
 * `"enum":["adjustment","capital","dispute","fee","instant_payout","loyalty","payment","refund","rebate"]`.
 */
function mapType(t: unknown): BalanceTransactionType {
  switch (t) {
    case 'payment':
      return 'charge'
    case 'refund':
      return 'refund'
    case 'instant_payout':
      return 'payout'
    case 'fee':
      return 'fee'
    case 'dispute':
      return 'dispute'
    case 'adjustment':
    case 'rebate':
    case 'loyalty':
      return 'adjustment'
    case 'capital':
      return 'other'
    default:
      return 'unknown'
  }
}

export function transformPayoutEntry(raw: RawYocoPayoutEntry): BalanceTransaction {
  const id = readId(raw.id, 'payout entry')
  const gross = readMoney(raw.gross_amount, 'gross_amount', id)
  const fee = raw.fee_amount === undefined ? undefined : readMoney(raw.fee_amount, 'fee_amount', id)
  const net = raw.net_amount === undefined ? undefined : readMoney(raw.net_amount, 'net_amount', id)
  const metadata = stringFields(raw, ['client_transaction_id', 'type'])
  return {
    id,
    externalId: id,
    type: mapType(raw.type),
    amount: gross.amount,
    currency: gross.currency,
    fee: fee?.amount,
    net: net?.amount,
    sourceId: readId(raw.payout_id, `payout entry ${id} payout_id`),
    sourceType: 'payout',
    gateway: 'yoco',
    metadata,
    raw,
  }
}
