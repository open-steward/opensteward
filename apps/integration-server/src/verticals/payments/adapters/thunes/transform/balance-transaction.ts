import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'

/**
 * A Thunes balance movement, as documented under "Balance Movement"
 * (https://docs.thunes.com/money-transfer/v2/#balance-movement):
 *
 *   { "balance_operation_number": 4376, "creation_date": "2022-12-01T16:28:03Z",
 *     "movement_type": "PAYOUT_FEES", "amount": -1.25, "currency": "USD",
 *     "transaction_reference_id": 123, "operation": "AUTHORIZE",
 *     "balance": 1162.56, "pending_balance": -120.39 }
 */
export interface RawThunesBalanceMovement {
  balance_operation_number?: number
  creation_date?: string
  movement_type?: string
  amount?: number
  currency?: string
  transaction_reference_id?: number | string
  operation?: string
  balance?: number
  pending_balance?: number
}

/** The documented "Balance Movement Type" values. */
function mapMovementType(t: unknown): BalanceTransactionType {
  switch (t) {
    case 'PAYOUT': // "Payout transaction"
      return 'payout'
    case 'PAYOUT_FEES': // "Fee for payout transaction"
    case 'MINIMUM_COMMITMENT_FEE': // "Minimum commitment fee"
    case 'CO_MARKETING_SUPPORT_FEE': // "Co-marketing support fee"
      return 'fee'
    case 'TRANSFER': // "Credit to balance"
    case 'WITHDRAWAL': // "Withdrawal from balance"
    case 'TRADE_CREDIT': // "Credit of funds via trading desk"
    case 'TRADE_DEBIT': // "Debit of funds via trading desk"
      return 'transfer'
    case 'REVERSAL': // "Reversal of payout transaction"
      return 'adjustment'
    case 'RETAIL_FEE_SHARING': // "Retail fee sharing"
    case 'COMMISSION_ON_SPREAD': // "Commission on spread"
    case 'RETAIL_RATE_SHARING': // "Retail rate sharing"
      return 'other'
    default:
      return 'unknown'
  }
}

/**
 * `balanceId` is the balance the movement was listed under
 * (GET /v2/money-transfer/balances/{balance_id}/movements). The id pairs it
 * with `balance_operation_number` because the docs do not say that operation
 * numbers are unique across balances.
 */
export function transformBalanceTransaction(
  raw: RawThunesBalanceMovement,
  balanceId: number | string,
): BalanceTransaction {
  const opNumber = raw.balance_operation_number
  if (typeof opNumber !== 'number' && typeof opNumber !== 'string') {
    throw new Error('Thunes balance movement has no balance_operation_number.')
  }
  const currency = raw.currency
  if (typeof currency !== 'string' || currency === '') {
    throw new Error(`Thunes balance movement ${opNumber} has no currency.`)
  }
  if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) {
    throw new Error(`Thunes balance movement ${opNumber} has no numeric amount.`)
  }

  const metadata: Record<string, string> = { balance_id: String(balanceId) }
  if (typeof raw.operation === 'string') metadata['operation'] = raw.operation

  return {
    id: `${balanceId}-${opNumber}`,
    externalId: String(opNumber),
    type: mapMovementType(raw.movement_type),
    // "amount … Decimal … Amount of the balance movement", in major units (-1.25 USD).
    amount: majorToMinor(raw.amount, currency),
    currency,
    sourceId:
      raw.transaction_reference_id != null ? String(raw.transaction_reference_id) : undefined,
    description: typeof raw.movement_type === 'string' ? raw.movement_type : undefined,
    gateway: 'thunes',
    metadata,
    createdAt: toIsoDatetime(raw.creation_date),
    raw,
  }
}
