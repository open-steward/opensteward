/**
 * Finix `BalanceEntry` ↔ canonical `BalanceTransaction`.
 *
 * A Finix BalanceEntry reflects a change to an application's Balance due to
 * a Transfer or a Balance Adjustment (top-up). Each entry has an `entity_id`
 * pointing to the source Transfer or BalanceAdjustment, an integer `amount`
 * in minor units, and a `state` of SUCCEEDED / PENDING / FAILED / RETURNED.
 *
 * Individual entries can be fetched directly at:
 *   GET /balance_entries/{balance_entry_id}
 *
 * The list endpoint is nested under a Balance:
 *   GET /balances/{balance_id}/balance_entries
 *
 * Docs: https://docs.finix.com/api/balances
 */
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { iso, pickCurrency, strMap } from './shared'

export interface RawFinixBalanceEntry {
  id?: string
  amount?: number | null
  created_by?: string | null
  currency?: string | null
  description?: string | null
  entity_id?: string | null
  entity_type?: string | null
  estimated_posted_date?: string | null
  linked_to?: string | null
  linked_type?: string | null
  parent_balance_entry_id?: string | null
  posted_at?: string | null
  state?: string | null
  tags?: Record<string, unknown> | null
  transaction_date?: string | null
  type?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(raw: RawFinixBalanceEntry): BalanceTransactionType {
  const t = (raw.type ?? '').toUpperCase()
  if (t.includes('REVERSAL') || t.includes('REFUND')) return 'refund'
  if (t.includes('DEBIT') || t.includes('CHARGE') || t.includes('PAYMENT')) return 'charge'
  if (t.includes('SETTLEMENT') || t.includes('PAYOUT') || t.includes('DISBURSE')) return 'payout'
  if (t.includes('DISPUTE') || t.includes('CHARGEBACK')) return 'dispute'
  if (t.includes('FEE')) return 'fee'
  if (t.includes('TRANSFER')) return 'transfer'
  if (t.includes('ADJUSTMENT') || t.includes('TOP_UP')) return 'adjustment'
  const entityType = (raw.entity_type ?? '').toUpperCase()
  if (entityType === 'BALANCE_ADJUSTMENT') return 'adjustment'
  if (entityType === 'TRANSFER') return 'transfer'
  return 'other'
}

export function transformBalanceTransaction(raw: RawFinixBalanceEntry): BalanceTransaction {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    sourceId: raw.entity_id ?? undefined,
    sourceType: raw.entity_type ?? undefined,
    availableOn: iso(raw.posted_at ?? raw.estimated_posted_date),
    description: raw.description ?? undefined,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      created_by: raw.created_by,
      linked_to: raw.linked_to,
      linked_type: raw.linked_type,
      parent_balance_entry_id: raw.parent_balance_entry_id,
      state: raw.state,
      transaction_date: raw.transaction_date,
      type: raw.type,
    }),
    createdAt: iso(raw.created_at),
    raw,
  }
}
