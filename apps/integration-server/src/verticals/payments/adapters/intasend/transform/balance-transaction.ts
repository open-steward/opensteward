/**
 * IntaSend balance transactions — wallet transactions
 * (`/api/v1/transactions/`).
 *
 * IntaSend's wallet transaction ledger records every debit and credit against
 * a wallet, including collections (SALE), disbursements (PAYOUT), adjustments,
 * deposits, and exchanges. It maps onto the canonical **BalanceTransaction**.
 *
 * The `/api/v1/transactions/` endpoint returns a paginated list with a `results`
 * envelope and individual items can be retrieved via `/api/v1/transactions/{id}/`.
 *
 * Field mapping:
 *   id / invoice      → id / externalId
 *   value             → amount (major units → minor units)
 *   currency          → currency (query param; may appear on record)
 *   trans_type        → type
 *   narrative         → description
 *   running_balance   → net (running balance after transaction)
 *   wallet_id         → metadata.wallet_id
 *
 * trans_type → canonical type:
 *   SALE       → charge
 *   PAYOUT     → payout
 *   WITHDRAWAL → payout
 *   ADJUSTMENT → adjustment
 *   CHARGE     → fee
 *   DEPOSIT    → charge
 *   EXCHANGE   → transfer
 *   AIRTIME    → other
 *   UNMARKED   → other
 *
 * Refs:
 *   https://developers.intasend.com/docs/wallet-transactions
 *   https://developers.intasend.com/reference/api_v1_transactions_list
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawIntasendTransaction {
  id?: number | string
  invoice?: string | null
  value?: string | number | null
  running_balance?: string | number | null
  narrative?: string | null
  currency?: string | null
  trans_type?: string | null
  wallet_id?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(transType: string | null | undefined): BalanceTransactionType {
  switch ((transType ?? '').toUpperCase()) {
    case 'SALE':
    case 'DEPOSIT':
      return 'charge'
    case 'PAYOUT':
    case 'WITHDRAWAL':
      return 'payout'
    case 'ADJUSTMENT':
      return 'adjustment'
    case 'CHARGE':
      return 'fee'
    case 'EXCHANGE':
      return 'transfer'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawIntasendTransaction): BalanceTransaction {
  const id = String(raw.id ?? raw.invoice ?? '')

  return {
    id,
    externalId: id,
    type: mapType(raw.trans_type),
    amount: toMinorUnits(raw.value) ?? 0,
    currency: pickCurrency(raw.currency),
    fee: undefined,
    feeDetails: undefined,
    net: toMinorUnits(raw.running_balance) ?? undefined,
    sourceId: raw.invoice ?? undefined,
    sourceType: raw.trans_type?.toLowerCase() ?? undefined,
    availableOn: undefined,
    description: raw.narrative ?? undefined,
    gateway: 'intasend',
    metadata: strMap({ wallet_id: raw.wallet_id }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
