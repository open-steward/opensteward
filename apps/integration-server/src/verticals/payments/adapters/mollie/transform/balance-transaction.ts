import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMollieSettlement {
  id?: string
  reference?: string
  type?: string
  resultAmount?: { value?: string; currency?: string }
  createdAt?: string
  [k: string]: unknown
}

function mapType(t: string | undefined): BalanceTransactionType {
  switch ((t ?? '').toLowerCase()) {
    case 'payment':
      return 'charge'
    case 'refund':
      return 'refund'
    case 'payout':
      return 'payout'
    case 'fee':
    case 'application-fee':
      return 'fee'
    case 'chargeback':
      return 'dispute'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawMollieSettlement): BalanceTransaction {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw.type),
    amount: decimalToMinor(raw.resultAmount?.value),
    currency: pickCurrency(raw.resultAmount?.currency),
    gateway: 'mollie',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.createdAt,
    raw,
  }
}
