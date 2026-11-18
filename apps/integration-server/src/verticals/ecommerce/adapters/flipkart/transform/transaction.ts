/**
 * Flipkart payment / settlement → canonical Transaction.
 *
 * Flipkart processes payments through its own payment gateway. Sellers
 * receive settlements on a periodic basis. Each order item has an associated
 * payment status and settlement information.
 *
 * Transaction id format: `${orderId}:${orderItemId}:${type}` — Flipkart
 * doesn't expose a standalone transaction id, so we synthesise one.
 *
 * Docs: https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'

export interface RawFlipkartTransaction {
  order_id: string
  order_item_id: string
  transaction_type: string
  amount: number
  currency_code: string
  status?: string
  settlement_id?: string
  settled_at?: string
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapKind(type: string | undefined): TransactionKind {
  if (!type) return 'CAPTURE'
  const upper = type.toUpperCase()
  if (upper.includes('REFUND') || upper.includes('RETURN')) return 'REFUND'
  if (upper.includes('SALE') || upper.includes('SETTLEMENT')) return 'SALE'
  return 'CAPTURE'
}

function mapStatus(status: string | undefined): TransactionStatus {
  if (!status) return 'SUCCESS'
  const upper = status.toUpperCase()
  if (upper === 'COMPLETED' || upper === 'SETTLED' || upper === 'SUCCESS') return 'SUCCESS'
  if (upper === 'PENDING') return 'PENDING'
  if (upper === 'FAILED') return 'FAILURE'
  return 'SUCCESS'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawFlipkartTransaction): Transaction {
  const kind = mapKind(raw.transaction_type)
  const status = mapStatus(raw.status)

  return {
    id: `${raw.order_id}:${raw.order_item_id}:${raw.transaction_type}`,
    orderId: raw.order_id,
    kind,
    status,
    amount: {
      amount: Math.abs(raw.amount),
      currency: raw.currency_code,
    },
    gateway: 'flipkart',
    processedAt: raw.settled_at ?? raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
