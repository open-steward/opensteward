/**
 * Solidus ReturnAuthorization -> canonical Refund.
 *
 * Solidus handles refunds via return authorizations, same as Spree:
 *  - `return_authorizations` -- RMA-style approval for returning items
 *  - `refunds` -- actual monetary refund records linked to payments
 *
 * Solidus-specific:
 *  - `return_authorization` may have a `reason` relationship (Solidus::ReturnReason)
 *    in addition to the `memo` text field.
 *
 * Platform API: `/api/v2/platform/return_authorizations`
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSolidusReturnItem {
  id?: number | string
  inventory_unit_id?: number | string
  line_item_id?: number | string
  exchange_variant_id?: number | string | null
  amount?: string | number
  reception_status?: string
  acceptance_status?: string
  [key: string]: unknown
}

export interface RawSolidusReturnAuthorization {
  id: number | string
  order_id?: number | string
  number?: string
  state?: string // authorized | canceled
  memo?: string | null
  amount?: string | number
  currency?: string
  return_items?: RawSolidusReturnItem[]
  reason?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapLineItems(
  items: RawSolidusReturnItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((it) => ({
    lineItemId: String(it.line_item_id ?? it.inventory_unit_id ?? it.id ?? ''),
    quantity: 1, // Solidus return items are per-unit
    amount:
      it.amount != null
        ? { amount: majorToMinor(toNum(it.amount), currency), currency }
        : undefined,
  }))
}

export function transformRefund(raw: RawSolidusReturnAuthorization): Refund {
  const currency = raw.currency ?? 'USD'
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : '',
    amount:
      raw.amount != null
        ? { amount: majorToMinor(toNum(raw.amount), currency), currency }
        : undefined,
    note: raw.memo ?? raw.reason ?? undefined,
    restock: true,
    refundLineItems: mapLineItems(raw.return_items, currency),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    return_authorization: {
      order_id: refund.orderId ? Number(refund.orderId) : undefined,
      memo: refund.note ?? refund.reason,
    },
  }
}
