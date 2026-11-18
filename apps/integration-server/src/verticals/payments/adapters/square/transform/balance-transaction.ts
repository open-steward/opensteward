import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap } from './shared'

/**
 * Square Payout Entry (balance transaction).
 *
 * Square exposes per-payout activity entries via
 * GET /v2/payouts/{payoutId}/payout-entries.
 * Each entry corresponds to one settlement line item (payment, refund, fee, etc.).
 *
 * Docs: https://developer.squareup.com/reference/square/payouts-api/list-payout-entries
 */
export interface RawSquarePayoutEntry {
  id?: string
  payout_id?: string
  effective_at?: string
  type?: string
  gross_amount_money?: { amount?: number; currency?: string }
  fee_amount_money?: { amount?: number; currency?: string }
  net_amount_money?: { amount?: number; currency?: string }
  [k: string]: unknown
}

function mapType(raw: string | undefined): BalanceTransactionType {
  if (!raw) return 'other'
  const t = raw.toUpperCase()
  if (t.includes('PAYMENT')) return 'charge'
  if (t.includes('REFUND')) return 'refund'
  if (t.includes('PAYOUT')) return 'payout'
  if (t.includes('FEE')) return 'fee'
  if (t.includes('DISPUTE')) return 'dispute'
  if (t.includes('ADJUSTMENT')) return 'adjustment'
  if (t.includes('TRANSFER')) return 'transfer'
  return 'other'
}

export function transformBalanceTransaction(raw: RawSquarePayoutEntry): BalanceTransaction {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    type: mapType(raw.type),
    amount: raw.gross_amount_money?.amount ?? 0,
    currency: pickCurrency(raw.gross_amount_money?.currency),
    fee: raw.fee_amount_money?.amount != null ? Math.abs(raw.fee_amount_money.amount) : undefined,
    net: raw.net_amount_money?.amount,
    sourceId: raw.payout_id,
    sourceType: raw.type,
    availableOn: raw.effective_at,
    gateway: 'square',
    metadata: strMap({ payout_id: raw.payout_id, type: raw.type }),
    createdAt: raw.effective_at,
    raw,
  }
}
