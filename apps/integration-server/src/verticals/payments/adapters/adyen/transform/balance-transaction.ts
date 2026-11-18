import { requireAmount } from '@opensteward/shared'

import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { pickCurrency, strMap } from './shared'

export interface RawAdyenBalanceTxn {
  id?: string
  type?: string
  amount?: { value?: number; currency?: string }
  status?: string
  creationDate?: string
  bookingDate?: string
  reference?: string
  [k: string]: unknown
}

function mapType(raw: string | undefined): BalanceTransactionType {
  switch ((raw ?? '').toLowerCase()) {
    case 'payment':
    case 'capture':
      return 'charge'
    case 'refund':
      return 'refund'
    case 'payout':
      return 'payout'
    case 'fee':
      return 'fee'
    case 'chargeback':
      return 'dispute'
    case 'adjustment':
      return 'adjustment'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawAdyenBalanceTxn): BalanceTransaction {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw.type),
    amount: requireAmount(raw.amount?.value, 'adyen balance-transaction'),
    currency: pickCurrency(raw.amount?.currency),
    availableOn: raw.bookingDate,
    gateway: 'adyen',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.creationDate,
    raw,
  }
}
