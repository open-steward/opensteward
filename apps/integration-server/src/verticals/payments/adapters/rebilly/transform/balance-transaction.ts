/**
 * Rebilly balance transaction → canonical BalanceTransaction
 * (components/schemas/BalanceTransaction.yaml, discriminated on `type`:
 * charge, refund, buy-fee, sell-fee, risk-reserve, risk-reserve-release,
 * reverse). Each variant carries `transactionId` ("ID of the related
 * transaction."), `settlementAmount` (x-type Money, x-currency-field
 * settlementCurrency, "number | null"), `settlementCurrency`,
 * `settlementTime` ("Date and time of the expected settlement.") and
 * `createdTime`.
 */
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { requireId, requireMoney, str } from './shared'

export interface RawRebillyBalanceTransaction {
  id?: string
  type?: string
  parentId?: string | null
  transactionId?: string
  settlementCurrency?: string
  settlementAmount?: number | null
  settlementTime?: string
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

function mapType(t: string | undefined): BalanceTransactionType {
  switch (t) {
    case 'charge':
      return 'charge'
    case 'refund':
      return 'refund'
    case 'buy-fee':
    case 'sell-fee':
      return 'fee'
    case 'risk-reserve':
    case 'risk-reserve-release':
    case 'reverse':
      return 'other'
    default:
      return 'unknown'
  }
}

export function transformBalanceTransaction(raw: RawRebillyBalanceTransaction): BalanceTransaction {
  const id = requireId(raw.id, 'balance transaction id')
  const money = requireMoney(
    raw.settlementAmount,
    raw.settlementCurrency,
    `balance transaction ${id}`,
  )
  return {
    id,
    externalId: id,
    type: mapType(raw.type),
    amount: money.amount,
    currency: money.currency,
    sourceId: str(raw.transactionId),
    sourceType: str(raw.type),
    availableOn: str(raw.settlementTime),
    gateway: 'rebilly',
    metadata: {},
    createdAt: str(raw.createdTime),
    raw,
  }
}
