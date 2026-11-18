/**
 * Sylius Refund -> canonical Refund.
 *
 * Sylius handles refunds via the RefundPlugin which adds a
 * `/api/v2/admin/refund-payments` or credit memo concept.
 * We model refunds based on the order-level refund info.
 *
 * Prices are in **cents**.
 */

import type { Refund } from '../../../schema/refund'

export interface RawSyliusRefund {
  id: number | string
  order?: { id?: number | string; number?: string } | string | null
  amount?: number // cents
  currencyCode?: string
  comment?: string | null
  type?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function centsToDecimal(cents: number | null | undefined): number {
  // Sylius reports money in integer minor units (cents) — already canonical.
  if (cents == null) return 0
  return Math.round(cents)
}

function extractOrderId(
  order: { id?: number | string; number?: string } | string | null | undefined,
): string {
  if (!order) return ''
  if (typeof order === 'string') {
    const parts = order.split('/')
    return parts[parts.length - 1] ?? ''
  }
  return order.id != null ? String(order.id) : ''
}

export function transformRefund(raw: RawSyliusRefund): Refund {
  const currency = raw.currencyCode ?? 'USD'
  return {
    id: String(raw.id),
    orderId: extractOrderId(raw.order),
    amount: raw.amount != null ? { amount: centsToDecimal(raw.amount), currency } : undefined,
    note: raw.comment ?? undefined,
    restock: true,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    order: refund.orderId,
    amount: refund.amount ? Math.round(refund.amount.amount) : undefined,
    comment: refund.note ?? refund.reason,
  }
}
