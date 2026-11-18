/**
 * Thirty Bees Order Payment → canonical Transaction.
 *
 * Thirty Bees (PrestaShop 1.6 fork) stores payment records for orders in
 * `/api/order_payments`. Each record includes the amount, payment method,
 * order reference, and transaction id issued by the payment module.
 *
 * Amounts are stored as decimal major-unit strings (e.g. "79.99") in the
 * store's configured currency.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Thirty Bees shape ───────────────────────────────────────────────────

export interface RawThirtyBeesOrderPayment {
  id: number | string
  order_reference?: string | null
  id_currency?: number | string | null
  amount?: string | number | null
  payment_method?: string | null
  conversion_rate?: string | number | null
  transaction_id?: string | null
  card_number?: string | null
  card_brand?: string | null
  card_expiration?: string | null
  card_holder?: string | null
  date_add?: string | null
  date_upd?: string | null
  // Enriched by adapter:
  _currency_iso?: string
  _order_id?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Math.round(n * 100)
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawThirtyBeesOrderPayment): Transaction {
  const currency = raw._currency_iso ?? 'EUR'
  const amount = toMinorUnits(raw.amount)

  const kind: TransactionKind = 'SALE'
  const status: TransactionStatus = 'SUCCESS'

  return {
    id: String(raw.id),
    orderId: raw._order_id ?? undefined,
    kind,
    status,
    amount: { amount, currency },
    gateway: raw.payment_method ?? undefined,
    authorizationCode: raw.transaction_id ?? undefined,
    processedAt: toIsoDatetime(raw.date_add),
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
