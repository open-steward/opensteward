/**
 * Shoper Payment → canonical Transaction.
 *
 * Shoper exposes payment records under:
 *   GET /webapi/rest/order-transactions[/{id}]
 *   GET /webapi/rest/payments[/{id}]  (payment methods/gateways, NOT individual transactions)
 *
 * Individual transaction records track a single payment event for an order.
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperTransaction {
  transaction_id?: number | string
  order_id?: number | string | null
  /** Payment gateway slug (e.g. 'payu', 'stripe', 'przelewy24'). */
  payment_id?: number | string | null
  gateway?: string | null
  amount?: string | number | null
  currency?: string | null
  /** 0 = pending/failed, 1 = success */
  status?: number | string | null
  reference?: string | null
  error_message?: string | null
  add_date?: string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(status: number | string | null | undefined): TransactionStatus | undefined {
  const n = toNum(status)
  if (n === 1) return 'SUCCESS'
  if (n === 0) return 'PENDING'
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawShoperTransaction): Transaction {
  const currency = raw.currency ?? 'PLN'
  const amount = toNum(raw.amount)

  return {
    id: String(raw.transaction_id ?? ''),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: 'SALE',
    status: mapStatus(raw.status),
    amount:
      amount > 0 ? { amount: majorToMinor(amount, currency), currency } : undefined,
    gateway: raw.gateway ?? (raw.payment_id != null ? String(raw.payment_id) : undefined),
    authorizationCode: raw.reference ?? undefined,
    parentTransactionId: undefined,
    errorCode: undefined,
    errorMessage: raw.error_message ?? undefined,
    processedAt: raw.add_date ?? undefined,
    createdAt: raw.add_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
