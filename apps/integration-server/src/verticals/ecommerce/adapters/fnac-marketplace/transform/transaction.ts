/**
 * WooCommerce Order → canonical Transaction.
 *
 * WooCommerce does not expose a standalone transaction resource. We derive a
 * transaction from each order, using the `payment_method` and order `total`
 * as the charge details. A refunded order produces a REFUND transaction kind.
 *
 * Money: WooCommerce returns totals as decimal strings (e.g. "19.99"). The
 * `majorToMinor` helper from the shared schema converts them to integer minor
 * units (cents).
 *
 * Auth code: `transaction_id` in WC meta_data (set by payment gateways).
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWooCommerceOrderMeta {
  key?: string
  value?: string | null
  [key: string]: unknown
}

export interface RawWooCommerceOrderForTransaction {
  id: number | string
  status?: string
  currency?: string
  total?: string | number
  payment_method?: string | null
  payment_method_title?: string | null
  transaction_id?: string | null
  meta_data?: RawWooCommerceOrderMeta[]
  date_paid_gmt?: string | null
  date_paid?: string | null
  date_created_gmt?: string | null
  date_created?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapKind(status: string | undefined): TransactionKind {
  const s = (status ?? '').toLowerCase()
  if (s === 'refunded') return 'REFUND'
  return 'SALE'
}

function mapStatus(wooStatus: string | undefined): TransactionStatus | undefined {
  switch ((wooStatus ?? '').toLowerCase()) {
    case 'completed':
    case 'processing':
      return 'SUCCESS'
    case 'pending':
    case 'on-hold':
      return 'PENDING'
    case 'failed':
      return 'FAILURE'
    case 'cancelled':
    case 'refunded':
      return 'SUCCESS'
    default:
      return undefined
  }
}

function getMetaValue(
  meta: RawWooCommerceOrderMeta[] | undefined,
  key: string,
): string | undefined {
  const entry = (meta ?? []).find((m) => m.key === key)
  return entry?.value ?? undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawWooCommerceOrderForTransaction): Transaction {
  const currency = raw.currency ?? 'USD'
  const totalMajor = toNum(raw.total)
  const totalMinor = majorToMinor(totalMajor, currency)

  const authCode =
    raw.transaction_id ??
    getMetaValue(raw.meta_data, '_transaction_id') ??
    undefined

  const processedAt = raw.date_paid_gmt ?? raw.date_paid ?? undefined
  const createdAt = raw.date_created_gmt ?? raw.date_created ?? undefined

  return {
    id: `${raw.id}`,
    orderId: String(raw.id),
    kind: mapKind(raw.status),
    status: mapStatus(raw.status),
    amount: totalMinor != null ? { amount: totalMinor, currency } : undefined,
    gateway: raw.payment_method ?? raw.payment_method_title ?? 'woocommerce',
    authorizationCode: authCode,
    processedAt: processedAt ?? undefined,
    createdAt: createdAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
