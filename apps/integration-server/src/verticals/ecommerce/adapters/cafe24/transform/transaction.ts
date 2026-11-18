/**
 * Cafe24 Payment → canonical Transaction.
 *
 * Cafe24 exposes payment information on orders via the `payment_method`,
 * `payment_status`, and `actual_price` fields rather than a dedicated
 * transactions list endpoint. We construct a synthetic transaction from the
 * order-level payment data.
 *
 * For the purposes of this adapter, each order produces at most one
 * canonical Transaction (the primary payment). Refunds are handled via the
 * Refund resource.
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#orders
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shapes ─────────────────────────────────────────────────────────

export interface RawCafe24Payment {
  /** Synthetic id — composed by the adapter as `${order_id}:payment`. */
  id?: string | null
  order_id: string
  payment_method?: string | null
  payment_gateway_name?: string | null
  payment_status?: string | null
  actual_price?: string | number | null
  currency?: string | null
  order_date?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

/**
 * Infer canonical TransactionKind from Cafe24 payment_status.
 * Cafe24 does not expose a separate "kind" — all initial payments are SALE.
 */
function inferKind(status: string | null | undefined): TransactionKind | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s.includes('refund')) return 'REFUND'
  if (s.includes('cancel') || s.includes('void')) return 'VOID'
  return 'SALE'
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  awaiting_payment: 'PENDING',
  payment_complete: 'SUCCESS',
  payment_cancel: 'FAILURE',
  refund_complete: 'SUCCESS',
  partial_refund: 'SUCCESS',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawCafe24Payment): Transaction {
  const currency = raw.currency ?? 'KRW'
  const statusKey = (raw.payment_status ?? '').toLowerCase()

  return {
    id: raw.id ?? `${raw.order_id}:payment`,
    orderId: String(raw.order_id),
    kind: inferKind(raw.payment_status),
    status: STATUS_MAP[statusKey] ?? undefined,
    amount:
      raw.actual_price != null
        ? { amount: majorToMinor(toNum(raw.actual_price), currency), currency }
        : undefined,
    gateway: raw.payment_gateway_name ?? raw.payment_method ?? undefined,
    processedAt: toIsoDatetime(raw.order_date),
    createdAt: toIsoDatetime(raw.order_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
