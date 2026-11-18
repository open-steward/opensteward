/**
 * Kibo Commerce Refund → canonical Refund.
 *
 * Kibo refunds (credits) are accessible via:
 *   GET /api/commerce/orders/{orderId}/credits
 *   GET /api/commerce/orders/{orderId}/credits/{creditId}
 *
 * Key fields:
 *   - `id`/`creditId`      → id
 *   - `orderId`            → orderId
 *   - `total`              → amount
 *   - `reason`/`comment`   → reason
 *   - `items[]`            → refundLineItems
 *   - `auditInfo`          → createdAt / updatedAt
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawKiboCreditItem {
  orderItemId?: string
  productCode?: string
  quantity?: number
  unitPrice?: number
  [key: string]: unknown
}

export interface RawKiboCredit {
  id?: string
  creditId?: string
  orderId?: string
  creditType?: string
  total?: number
  currencyCode?: string
  reason?: string
  comment?: string
  items?: RawKiboCreditItem[]
  auditInfo?: { createDate?: string; updateDate?: string }
  [key: string]: unknown
}

export function transformRefund(raw: RawKiboCredit, orderId?: string): Refund {
  const id = raw.id ?? raw.creditId ?? ''
  const currency = raw.currencyCode ?? 'USD'

  return {
    id,
    orderId: raw.orderId ?? orderId ?? '',
    amount: raw.total != null
      ? { amount: majorToMinor(raw.total, currency), currency }
      : undefined,
    reason: raw.reason ?? raw.comment ?? undefined,
    refundLineItems: (raw.items ?? []).length > 0
      ? (raw.items ?? []).map((item) => ({
          lineItemId: item.orderItemId ?? '',
          quantity: item.quantity ?? 1,
          amount: item.unitPrice != null
            ? { amount: majorToMinor(item.unitPrice, currency), currency }
            : undefined,
        }))
      : undefined,
    createdAt: raw.auditInfo?.createDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
