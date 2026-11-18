import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { pickCurrency, strMap } from './shared'

export interface RawGCPayoutItem {
  id?: string
  amount?: string
  type?: string
  links?: { payment?: string; refund?: string; payout?: string }
  [k: string]: unknown
}

function mapType(t: string | undefined): BalanceTransactionType {
  switch ((t ?? '').toLowerCase()) {
    case 'payment_paid_out':
      return 'charge'
    case 'payment_refunded':
      return 'refund'
    case 'gocardless_fee':
    case 'app_fee':
      return 'fee'
    case 'chargeback':
      return 'dispute'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(
  raw: RawGCPayoutItem,
  currency: string,
): BalanceTransaction {
  const sourceId =
    raw.links?.payment ?? raw.links?.refund ?? raw.links?.payout ?? undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw.type),
    amount: raw.amount ? parseInt(raw.amount, 10) : 0,
    currency: pickCurrency(currency),
    sourceId,
    sourceType: raw.type,
    gateway: 'gocardless',
    metadata: strMap({}),
    raw,
  }
}
