/**
 * Lemon Squeezy Order → canonical Transaction.
 *
 * Lemon Squeezy does not expose a standalone "transaction" resource. We derive
 * transactions from orders: each paid order represents a SALE transaction,
 * and each refunded order represents a REFUND transaction.
 *
 * Amounts are already in integer minor units (cents) in the LS API.
 *
 * Docs: https://docs.lemonsqueezy.com/api/orders/the-order-object
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import type { LsResource } from '../client'

// ── Raw shape ─────────────────────────────────────────────────────────────────

export interface RawLsTransactionAttributes {
  store_id: number
  customer_id: number
  order_number?: number
  /** "pending" | "paid" | "refunded" */
  status: string
  currency: string
  total: number           // cents
  created_at: string
  updated_at: string
  refunded_at?: string | null
  [key: string]: unknown
}

export type RawLsTransaction = LsResource<RawLsTransactionAttributes>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapKind(status: string): TransactionKind {
  if (status === 'refunded') return 'REFUND'
  return 'SALE'
}

function mapStatus(status: string): TransactionStatus | undefined {
  switch (status) {
    case 'paid':
      return 'SUCCESS'
    case 'refunded':
      return 'SUCCESS'
    case 'pending':
      return 'PENDING'
    default:
      return undefined
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawLsTransaction): Transaction {
  const attrs = raw.attributes
  const currency = attrs.currency ?? 'USD'

  return {
    id: raw.id,
    orderId: raw.id,
    kind: mapKind(attrs.status),
    status: mapStatus(attrs.status),
    amount: attrs.total != null ? { amount: attrs.total, currency } : undefined,
    gateway: 'lemon-squeezy',
    processedAt: attrs.status === 'refunded' ? (attrs.refunded_at ?? attrs.updated_at) : attrs.created_at,
    createdAt: attrs.created_at,
    metadata: { id: raw.id, type: raw.type, status: attrs.status, order_number: String(attrs.order_number ?? '') },
  }
}
