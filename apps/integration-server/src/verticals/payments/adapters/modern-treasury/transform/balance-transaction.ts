import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap, safeInt } from './shared'

/**
 * Modern Treasury Transaction.
 *
 * Modern Treasury exposes individual bank transactions posted to internal
 * accounts via GET /transactions and GET /transactions/{id}.
 *
 * These map naturally to the canonical BalanceTransaction resource.
 *
 * Docs: https://docs.moderntreasury.com/reference/list-transactions
 */
export interface RawModernTreasuryTransaction {
  id?: string
  type?: string          // e.g. "ach", "wire", "card", "rtp", "book"
  direction?: string     // "credit" | "debit"
  amount?: number        // integer minor units
  currency?: string
  status?: string        // "reconciled" | "reconciling" | "posted" | "returned"
  description?: string
  internal_account_id?: string
  vendor_id?: string     // external reference (e.g. charge id)
  vendor_type?: string
  as_of_date?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, string>
  [k: string]: unknown
}

function mapType(raw: RawModernTreasuryTransaction): BalanceTransactionType {
  const t = (raw.type ?? '').toLowerCase()
  const dir = (raw.direction ?? '').toLowerCase()

  if (t === 'card') return dir === 'debit' ? 'charge' : 'refund'
  if (t.includes('reversal') || t.includes('return')) return 'refund'
  if (t.includes('payout') || t.includes('wire') || t.includes('ach') || t.includes('rtp')) {
    return dir === 'credit' ? 'payout' : 'transfer'
  }
  if (t.includes('fee')) return 'fee'
  if (t.includes('adjustment')) return 'adjustment'
  if (t.includes('dispute')) return 'dispute'
  if (t.includes('transfer') || t.includes('book')) return 'transfer'
  return 'other'
}

export function transformBalanceTransaction(raw: RawModernTreasuryTransaction): BalanceTransaction {
  const id = String(raw.id ?? '')
  // MT amounts are already integer minor units; debit amounts are positive
  const rawAmount = safeInt(raw.amount)
  const amount = (raw.direction ?? '').toLowerCase() === 'debit' ? -rawAmount : rawAmount

  return {
    id,
    externalId: id,
    type: mapType(raw),
    amount,
    currency: pickCurrency(raw.currency),
    sourceId: raw.vendor_id ?? raw.internal_account_id,
    sourceType: raw.vendor_type ?? raw.type,
    availableOn: raw.as_of_date,
    description: raw.description || undefined,
    gateway: 'modern-treasury',
    metadata: strMap(raw.metadata ?? { type: raw.type, direction: raw.direction }),
    createdAt: raw.created_at,
    raw,
  }
}
