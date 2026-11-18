/**
 * Airwallex Transaction History Entry → canonical BalanceTransaction.
 *
 * Airwallex exposes ledger entries via the Financial Services API:
 *   GET /api/v1/transactions        (list)
 *   GET /api/v1/transactions/{id}   (single)
 *
 * Each entry carries a `type` (payment, refund, transfer, fee, …), an amount
 * in major units, and the UTC timestamp of the settlement event.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/financial-services/transactions
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { toMinorUnits, pickCurrency, strMap } from './shared'

export interface RawAirwallexTransaction {
  id?: string
  type?: string             // PAYMENT, REFUND, TRANSFER, FEE, ADJUSTMENT, PAYOUT, …
  amount?: number           // major units (can be negative for debits)
  currency?: string
  source_id?: string        // back-reference to charge / refund / transfer
  description?: string
  available_on?: string     // ISO-8601 when funds become available
  fee?: number              // platform / processing fee, major units
  net?: number              // net amount after fee, major units
  created_at?: string
  [k: string]: unknown
}

function mapType(raw: RawAirwallexTransaction): BalanceTransactionType {
  const t = (raw.type ?? '').toLowerCase()
  if (t.includes('payment') || t.includes('charge')) return 'charge'
  if (t.includes('refund')) return 'refund'
  if (t.includes('transfer') || t.includes('payout')) return 'payout'
  if (t.includes('fee')) return 'fee'
  if (t.includes('adjust')) return 'adjustment'
  if (t.includes('dispute')) return 'dispute'
  return 'other'
}

export function transformBalanceTransaction(raw: RawAirwallexTransaction): BalanceTransaction {
  const amount = toMinorUnits(raw.amount) ?? 0
  const currency = pickCurrency(raw.currency)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw),
    amount,
    currency,
    fee: raw.fee != null ? (toMinorUnits(raw.fee) ?? 0) : undefined,
    net: raw.net != null ? (toMinorUnits(raw.net) ?? 0) : undefined,
    sourceId: raw.source_id ?? undefined,
    sourceType: raw.type ?? undefined,
    availableOn: toIsoDatetime(raw.available_on),
    description: raw.description ?? undefined,
    gateway: 'airwallex',
    metadata: strMap({ type: raw.type, source_id: raw.source_id }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
