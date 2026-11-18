/**
 * SCAYLE OrderPayment → canonical Transaction.
 *
 * SCAYLE embeds payment information on orders as `payment[]` (OrderPayment).
 * The Admin API does not expose a standalone transactions list endpoint —
 * payment data is retrieved as part of the order object.
 *
 * OrderPayment fields:
 *  - id (int), referenceKey, method (payment method slug),
 *    status (e.g. "paid", "pending", "refunded"),
 *    amount / refundedAmount (int minor units), currency
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleOrderPayment {
  id: number | string
  referenceKey?: string | null
  method?: string | null
  status?: string | null
  /** Amount in minor units (integer cents). */
  amount?: number | null
  /** Refunded amount in minor units. */
  refundedAmount?: number | null
  currency?: string | null
  orderId?: number | string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, TransactionStatus> = {
  paid: 'SUCCESS',
  pending: 'PENDING',
  failed: 'FAILURE',
  error: 'ERROR',
  refunded: 'SUCCESS',
  cancelled: 'FAILURE',
  canceled: 'FAILURE',
}

function mapKind(status: string | null | undefined, method: string | null | undefined): TransactionKind | undefined {
  const s = (status ?? '').toLowerCase()
  if (s === 'refunded') return 'REFUND'
  if (method?.toLowerCase().includes('capture')) return 'CAPTURE'
  return 'SALE'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawScayleOrderPayment): Transaction {
  const currency = raw.currency ?? 'EUR'
  const status = (raw.status ?? '').toLowerCase()
  return {
    id: String(raw.id),
    orderId: raw.orderId != null ? String(raw.orderId) : undefined,
    kind: mapKind(raw.status, raw.method),
    status: STATUS_MAP[status] ?? undefined,
    amount:
      raw.amount != null
        ? { amount: raw.amount, currency }
        : undefined,
    gateway: raw.method ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
