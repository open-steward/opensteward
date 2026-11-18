/**
 * Trendyol claim → canonical Refund.
 *
 * Trendyol exposes returned/claimed orders via:
 *   GET /integration/order/sellers/{sellerId}/claims
 *
 * Each claim record represents a return/refund request initiated by the
 * customer. The claim contains item-level detail but no explicit refund amount
 * field — Trendyol handles the monetary refund internally. We derive the
 * amount from item unit prices when available.
 *
 * Key mapping decisions:
 *
 *   id                    → Refund.id
 *   orderNumber           → Refund.orderId (best available; no numeric orderId)
 *   orderShipmentPackageId→ also available as alternate orderId
 *   claimDate             → Refund.processedAt / Refund.createdAt (epoch ms)
 *   customerClaimItemReason.name → Refund.reason (first item reason)
 *   items[].claimItems    → Refund.refundLineItems
 *   items[].orderLine     → line item detail (product name, price)
 *
 * Docs: https://developers.trendyol.com/v2.0/docs/getting-returned-orders-getclaims
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Trendyol shapes ──────────────────────────────────────────────────────

export interface RawTrendyolClaimReason {
  name?: string | null
  externalReasonId?: number | string | null
  code?: string | null
  [key: string]: unknown
}

export interface RawTrendyolClaimItemStatus {
  name?: string | null
  [key: string]: unknown
}

export interface RawTrendyolClaimItem {
  id: number | string
  orderLineItemId?: number | string | null
  customerClaimItemReason?: RawTrendyolClaimReason | null
  trendyolClaimItemReason?: RawTrendyolClaimReason | null
  claimItemStatus?: RawTrendyolClaimItemStatus | null
  note?: string | null
  customerNote?: string | null
  resolved?: boolean
  autoAccepted?: boolean
  acceptedBySeller?: boolean
  [key: string]: unknown
}

export interface RawTrendyolOrderLine {
  productName?: string | null
  barcode?: string | null
  stockCode?: string | null
  quantity?: number | null
  price?: number | null
  vatBaseAmount?: number | null
  currencyCode?: string | null
  [key: string]: unknown
}

export interface RawTrendyolClaimItemGroup {
  orderLine?: RawTrendyolOrderLine | null
  claimItems?: RawTrendyolClaimItem[]
  [key: string]: unknown
}

export interface RawTrendyolClaim {
  id: number | string
  orderNumber?: string | null
  orderShipmentPackageId?: number | string | null
  orderDate?: number | null
  claimDate?: number | null
  lastModifiedDate?: number | null
  customerFirstName?: string | null
  customerLastName?: string | null
  cargoTrackingNumber?: string | null
  cargoTrackingLink?: string | null
  cargoSenderNumber?: string | null
  cargoProviderName?: string | null
  items?: RawTrendyolClaimItemGroup[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function extractFirstReason(items: RawTrendyolClaimItemGroup[] | undefined): string | undefined {
  if (!items?.length) return undefined
  const firstGroup = items[0]
  const claimItems = firstGroup?.claimItems
  if (!claimItems?.length) return undefined
  const firstItem = claimItems[0]
  return (
    firstItem?.customerClaimItemReason?.name ??
    firstItem?.trendyolClaimItemReason?.name ??
    undefined
  )
}

function buildRefundLineItems(items: RawTrendyolClaimItemGroup[] | undefined): RefundLineItem[] {
  if (!items?.length) return []
  const out: RefundLineItem[] = []
  for (const group of items) {
    const orderLine = group.orderLine
    const currency = orderLine?.currencyCode ?? 'TRY'
    const unitPrice = toNum(orderLine?.price)
    const claimItems = group.claimItems ?? []
    for (const ci of claimItems) {
      const lineItemId = ci.orderLineItemId != null ? String(ci.orderLineItemId) : String(ci.id)
      out.push({
        lineItemId,
        quantity: 1,
        amount:
          unitPrice > 0
            ? { amount: majorToMinor(unitPrice, currency), currency }
            : undefined,
      })
    }
  }
  return out
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawTrendyolClaim): Refund {
  return {
    id: String(raw.id),
    orderId:
      raw.orderShipmentPackageId != null
        ? String(raw.orderShipmentPackageId)
        : (raw.orderNumber ?? String(raw.id)),
    reason: extractFirstReason(raw.items),
    refundLineItems: buildRefundLineItems(raw.items),
    processedAt: toIsoDatetime(raw.claimDate ?? raw.lastModifiedDate),
    createdAt: toIsoDatetime(raw.claimDate ?? raw.orderDate),
    metadata: raw as Record<string, unknown>,
  }
}
