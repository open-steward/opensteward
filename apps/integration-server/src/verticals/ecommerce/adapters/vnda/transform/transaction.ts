/**
 * VNDA Transaction — derived from the order object.
 *
 * VNDA (Olist Ecommerce) has no dedicated transaction endpoint. Payment
 * data is embedded on the order: `payment_method`, `payment_method_title`,
 * `total`, `currency`, `status`, and `date_paid`. We derive one canonical
 * Transaction per order from those fields.
 *
 * Derivation rules:
 *   - kind: orders with status 'refunded' → REFUND; all others → SALE.
 *   - status: 'processing' / 'completed' / 'refunded' → SUCCESS;
 *             'failed' / 'cancelled' → FAILURE; everything else → PENDING.
 *   - The canonical id is the WooCommerce/VNDA order id prefixed with 'txn_'.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw WC/VNDA order shape (payment-relevant subset) ───────────────────────

export interface RawVndaOrderForTransaction {
  id: number | string
  status?: string
  currency?: string
  total?: string | number
  payment_method?: string | null
  payment_method_title?: string | null
  date_paid?: string | null
  date_paid_gmt?: string | null
  date_created?: string | null
  date_created_gmt?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapKind(status: string | undefined): TransactionKind {
  if (status === 'refunded') return 'REFUND'
  return 'SALE'
}

function mapStatus(status: string | undefined): TransactionStatus {
  switch (status) {
    case 'processing':
    case 'completed':
    case 'refunded':
      return 'SUCCESS'
    case 'failed':
    case 'cancelled':
      return 'FAILURE'
    default:
      return 'PENDING'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawVndaOrderForTransaction): Transaction {
  const currency = raw.currency ?? 'BRL'
  const totalMinor = majorToMinor(toNum(raw.total), currency)
  const processedAt = raw.date_paid_gmt ?? raw.date_paid ?? undefined
  const createdAt = raw.date_created_gmt ?? raw.date_created ?? undefined

  return {
    id: `txn_${String(raw.id)}`,
    orderId: String(raw.id),
    kind: mapKind(raw.status),
    status: mapStatus(raw.status),
    amount: { amount: totalMinor, currency },
    gateway: raw.payment_method ?? undefined,
    processedAt: processedAt ?? undefined,
    createdAt: createdAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
