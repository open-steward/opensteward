/**
 * CoinPayments *wallet transaction* → canonical {@link BalanceTransaction}.
 *
 * A merchant wallet's transaction history (`GET /v2/merchant/wallets/{id}/
 * transactions`) is the closest canonical resource to a balance transaction: it
 * records on-chain money movement (deposits / spends) crediting or debiting the
 * wallet. Deposits are positive amounts; spends are negative. The amount lives
 * in `amount` (`{ currencyId, value, displayValue }`) where `value` is already
 * integer minor units.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 *
 * Docs: https://docs.coinpayments.net/api/transactions/
 */
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { resolveAmount, strMap, type CoinpaymentsAmountSlot } from './shared'

export interface RawCoinpaymentsWalletTransaction {
  id?: string
  type?: string
  status?: string
  amount?: CoinpaymentsAmountSlot
  fee?: CoinpaymentsAmountSlot
  txHash?: string
  address?: string
  confirmations?: number
  spendRequestId?: string
  invoiceId?: string
  createdAt?: string
  [k: string]: unknown
}

/** CoinPayments wallet-transaction type → canonical balance-transaction type. */
function mapType(type: string | undefined): BalanceTransactionType {
  switch ((type ?? '').toLowerCase()) {
    case 'deposit':
    case 'received':
    case 'credit':
      return 'charge'
    case 'spend':
    case 'withdrawal':
    case 'sent':
    case 'debit':
      return 'payout'
    case 'fee':
      return 'fee'
    case 'transfer':
      return 'transfer'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(
  raw: RawCoinpaymentsWalletTransaction,
): BalanceTransaction {
  const id = String(raw.id ?? '')
  const { amount, currency } = resolveAmount(raw.amount)
  const fee = raw.fee ? resolveAmount(raw.fee, currency).amount : undefined

  return {
    id,
    externalId: id,
    type: mapType(raw.type),
    amount,
    currency,
    fee,
    sourceId: raw.invoiceId ?? raw.spendRequestId ?? undefined,
    sourceType: raw.type ? String(raw.type) : undefined,
    description: raw.txHash ? `tx ${raw.txHash}` : undefined,
    gateway: 'coinpayments',
    metadata: strMap({
      status: raw.status,
      txHash: raw.txHash,
      address: raw.address,
      confirmations: raw.confirmations,
      spendRequestId: raw.spendRequestId,
      invoiceId: raw.invoiceId,
    }),
    createdAt: toIsoDatetime(raw.createdAt),
    raw,
  }
}
