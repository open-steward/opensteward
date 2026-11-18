/**
 * WooCommerce (Wildberries) Order → canonical Transaction.
 *
 * WooCommerce exposes payment data as fields on the order; there is no
 * separate transactions endpoint in the base WC API. We derive one
 * canonical Transaction per paid order from the order's payment info.
 *
 * Kind mapping:
 *   status=completed/processing → SALE
 *   status=refunded             → REFUND
 *   status=cancelled/failed     → VOID
 *   status=pending/on-hold      → AUTHORIZATION
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import type { RawWooCommerceOrder } from './order'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapKind(status: string | undefined): TransactionKind {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'processing':
      return 'SALE'
    case 'refunded':
      return 'REFUND'
    case 'cancelled':
    case 'failed':
      return 'VOID'
    case 'pending':
    case 'on-hold':
      return 'AUTHORIZATION'
    default:
      return 'SALE'
  }
}

function mapTxStatus(status: string | undefined): TransactionStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'processing':
    case 'refunded':
      return 'SUCCESS'
    case 'failed':
      return 'FAILURE'
    case 'cancelled':
    case 'pending':
    case 'on-hold':
      return 'PENDING'
    default:
      return 'SUCCESS'
  }
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawWooCommerceOrder): Transaction {
  const currency = raw.currency ?? 'USD'
  const totalNum = toNum(raw.total)
  const amount =
    totalNum !== 0
      ? { amount: majorToMinor(totalNum, currency), currency }
      : undefined

  return {
    id: `txn-${raw.id}`,
    orderId: String(raw.id),
    kind: mapKind(raw.status),
    status: mapTxStatus(raw.status),
    amount,
    gateway: raw.payment_method ?? undefined,
    processedAt: raw.date_paid_gmt ?? raw.date_paid ?? undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
