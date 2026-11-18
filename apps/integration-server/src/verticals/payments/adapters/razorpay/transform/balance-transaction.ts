import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpaySettlement {
  id?: string
  entity?: string
  amount?: number
  status?: string
  fees?: number
  tax?: number
  utr?: string
  created_at?: number
  [k: string]: unknown
}

function mapType(t: string | undefined): BalanceTransactionType {
  switch ((t ?? '').toLowerCase()) {
    case 'settlement':
      return 'payout'
    case 'adjustment':
      return 'adjustment'
    case 'refund':
      return 'refund'
    case 'fee':
      return 'fee'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(
  raw: RawRazorpaySettlement,
): BalanceTransaction {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw.entity),
    amount: raw.amount ?? 0,
    currency: pickCurrency('INR'),
    fee: raw.fees,
    gateway: 'razorpay',
    metadata: strMap({ utr: raw.utr, status: raw.status, tax: raw.tax }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
