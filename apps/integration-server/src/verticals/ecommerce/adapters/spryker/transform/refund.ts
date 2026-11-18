/**
 * Spryker returns → canonical Refund.
 *
 * Spryker Glue REST API does not expose a dedicated top-level `/refunds`
 * endpoint. Returns (refunds) are managed via the Returns Management API
 * (`/returns`, type "returns") available in Spryker's Returns module.
 *
 * Resource type: "returns"
 * Key attributes: returnReference, store, returnTotals (remunerationTotal,
 *   refundTotal), items (returnPolicyName, state, reason, uuid), createdAt.
 *
 * The canonical `orderId` is derived from the return items' order references
 * if available.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import type { JsonApiResource } from '../client'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Spryker shape ─────────────────────────────────────────────────────────

export interface RawSprykerReturnItem {
  uuid?: string | null
  reason?: string | null
  state?: string | null
  returnPolicyName?: string | null
  orderItem?: {
    name?: string | null
    sku?: string | null
    sumPrice?: number | null
    quantity?: number | null
    idSalesOrderItem?: number | null
    uuid?: string | null
  } | null
}

export interface RawSprykerReturnTotals {
  remunerationTotal?: number | null
  refundTotal?: number | null
}

export interface RawSprykerReturnAttributes {
  returnReference?: string | null
  store?: string | null
  returnTotals?: RawSprykerReturnTotals | null
  items?: RawSprykerReturnItem[]
  createdAt?: string | null
  [key: string]: unknown
}

export type RawSprykerReturn = JsonApiResource<RawSprykerReturnAttributes>

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformReturn(raw: RawSprykerReturn, currency = 'EUR'): Refund {
  const attrs = raw.attributes
  const items = attrs.items ?? []
  const totals = attrs.returnTotals ?? {}

  const refundLineItems: RefundLineItem[] | undefined =
    items.length > 0
      ? items.map((item) => ({
          lineItemId: item.uuid ?? item.orderItem?.uuid ?? item.orderItem?.idSalesOrderItem?.toString() ?? 'unknown',
          quantity: item.orderItem?.quantity ?? 1,
          amount:
            item.orderItem?.sumPrice != null
              ? { amount: item.orderItem.sumPrice, currency }
              : undefined,
        }))
      : undefined

  const refundAmount = totals.refundTotal ?? totals.remunerationTotal

  return {
    id: raw.id,
    // Spryker returns are not directly linked to a single orderId; leave
    // undefined when not derivable.
    orderId: '',
    amount: refundAmount != null ? { amount: refundAmount, currency } : undefined,
    note: items[0]?.reason ?? undefined,
    refundLineItems,
    createdAt: toIsoDatetime(attrs.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
