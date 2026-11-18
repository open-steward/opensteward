/**
 * Amazon SP-API Finances RefundEvent → canonical Refund.
 *
 * Amazon doesn't expose refunds as a first-class resource. They live as
 * events inside the Finances API response:
 *
 *   GET /finances/v2024-06-19/financialEvents?PostedAfter=... (or ?AmazonOrderId=...)
 *       → { FinancialEvents: { RefundEventList: [...] } }
 *
 * A RefundEvent carries an `AmazonOrderId`, a `PostedDate`, and one or
 * more `ShipmentItemAdjustmentList` entries describing the adjustment
 * amounts per SKU. We aggregate them into a canonical Refund.
 *
 * Refund id format: `${amazonOrderId}:${postedDate}` — Amazon doesn't
 * surface a stable refund id, so we synthesise a composite from the
 * fields that *are* unique per event.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import type { RawAmazonMoney } from './order'

export interface RawAmazonChargeComponent {
  ChargeType?: string
  ChargeAmount?: RawAmazonMoney
}

export interface RawAmazonShipmentItemAdjustment {
  SellerSKU?: string
  OrderItemId?: string
  OrderAdjustmentItemId?: string
  QuantityShipped?: number
  ItemChargeAdjustmentList?: RawAmazonChargeComponent[]
  ItemFeeAdjustmentList?: RawAmazonChargeComponent[]
  ItemTaxWithheldList?: unknown[]
  [key: string]: unknown
}

export interface RawAmazonRefundEvent {
  AmazonOrderId: string
  SellerOrderId?: string
  MarketplaceName?: string
  PostedDate?: string
  ShipmentItemAdjustmentList?: RawAmazonShipmentItemAdjustment[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(m: RawAmazonMoney | undefined): number {
  if (!m) return 0
  const n = parseFloat(m.Amount)
  return Number.isNaN(n) ? 0 : n
}

function currencyOf(event: RawAmazonRefundEvent): string {
  for (const adj of event.ShipmentItemAdjustmentList ?? []) {
    for (const c of adj.ItemChargeAdjustmentList ?? []) {
      if (c.ChargeAmount?.CurrencyCode) return c.ChargeAmount.CurrencyCode
    }
  }
  return 'USD'
}

function sumAdjustment(adj: RawAmazonShipmentItemAdjustment): number {
  // Refund events express adjustments as negative amounts (money flowing
  // back to the buyer). We flip sign so the canonical `amount` is
  // positive — callers can still inspect the raw event via metadata.
  const charge = (adj.ItemChargeAdjustmentList ?? []).reduce(
    (acc, c) => acc + toNum(c.ChargeAmount),
    0,
  )
  return Math.abs(charge)
}

function mapRefundLineItem(
  adj: RawAmazonShipmentItemAdjustment,
  currency: string,
): RefundLineItem {
  return {
    lineItemId: adj.OrderItemId ?? adj.OrderAdjustmentItemId ?? adj.SellerSKU ?? 'unknown',
    quantity: adj.QuantityShipped ?? 0,
    amount: { amount: majorToMinor(sumAdjustment(adj), currency), currency },
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawAmazonRefundEvent): Refund {
  const currency = currencyOf(raw)
  const refundLineItems = (raw.ShipmentItemAdjustmentList ?? []).map((adj) =>
    mapRefundLineItem(adj, currency),
  )
  const total = refundLineItems.reduce((acc, li) => acc + (li.amount?.amount ?? 0), 0)
  const postedKey = raw.PostedDate ?? 'unknown'

  return {
    id: `${raw.AmazonOrderId}:${postedKey}`,
    orderId: raw.AmazonOrderId,
    amount:
      total > 0
        ? { amount: total, currency }
        : undefined,
    refundLineItems: refundLineItems.length > 0 ? refundLineItems : undefined,
    processedAt: raw.PostedDate,
    createdAt: raw.PostedDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
