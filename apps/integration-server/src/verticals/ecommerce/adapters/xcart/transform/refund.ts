/**
 * X-Cart Order Refund → canonical Refund.
 *
 * X-Cart exposes refunds on orders via GET /api/orders/{order_id}/refunds.
 *
 * Key fields:
 *   id, order_id, amount (decimal), reason, date (UNIX timestamp)
 */
import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface XCartRefund {
  id?: number | string
  order_id?: number | string
  amount?: number | null
  currency?: string | null
  reason?: string | null
  date?: number | string | null
  [key: string]: unknown
}

function toIso(v: number | string | null | undefined): string | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!isFinite(n) || n === 0) return undefined
  return new Date(n * 1000).toISOString()
}

export function transformRefund(raw: XCartRefund, orderId?: string): Refund {
  const currency = raw.currency ?? 'USD'
  const resolvedOrderId = orderId ?? (raw.order_id != null ? String(raw.order_id) : '')

  return {
    id: String(raw.id ?? ''),
    orderId: resolvedOrderId,
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    reason: raw.reason ?? undefined,
    processedAt: toIso(raw.date),
    createdAt: toIso(raw.date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
