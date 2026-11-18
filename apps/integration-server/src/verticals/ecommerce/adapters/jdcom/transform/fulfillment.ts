/**
 * JD.com logistics / shipping → canonical Fulfillment.
 *
 * JD manages shipping through its logistics system. The `jingdong.logistics.trace.get`
 * API returns tracking info for an order. Fulfillment is synthesised from
 * order-level shipping data.
 *
 * Fulfillment id format: `${order_id}:shipping` — synthetic since JD
 * doesn't expose a per-shipment resource.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawJdOrder } from './order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdTraceItem {
  msg_time?: string
  content?: string
  operator?: string
  [key: string]: unknown
}

export interface RawJdLogisticsTrace {
  waybill_code?: string
  carrier?: string
  carrier_name?: string
  trace_list?: RawJdTraceItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map JD order state to canonical fulfillment status.
 */
export function mapFulfillmentStatus(orderState: string | undefined): FulfillmentStatus {
  if (!orderState) return 'PENDING'
  switch (orderState) {
    case 'WAIT_SELLER_STOCK_OUT':
    case 'WAIT_SELLER_DELIVERY':
      return 'OPEN'
    case 'WAIT_GOODS_RECEIVE':
      return 'SUCCESS'
    case 'FINISHED_L':
      return 'SUCCESS'
    case 'TRADE_CANCELED':
      return 'CANCELLED'
    case 'LOCKED':
      return 'PENDING'
    default:
      return 'PENDING'
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build a fulfillment from an order + optional logistics trace.
 */
export function transformFulfillment(
  order: RawJdOrder,
  trace?: RawJdLogisticsTrace,
): Fulfillment {
  const lineItems = (order.item_info_list ?? []).map((item) => ({
    lineItemId: item.sku_id != null ? String(item.sku_id) : '0',
    quantity: item.item_total ?? 1,
  }))

  return {
    id: `${order.order_id}:shipping`,
    orderId: order.order_id,
    status: mapFulfillmentStatus(order.order_state),
    trackingNumber: trace?.waybill_code ?? order.waybill,
    carrier: trace?.carrier_name ?? trace?.carrier,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt:
      order.order_state === 'WAIT_GOODS_RECEIVE' && order.modified
        ? new Date(order.modified).toISOString()
        : undefined,
    createdAt: order.order_start_time
      ? new Date(order.order_start_time).toISOString()
      : undefined,
    metadata: {
      order_id: order.order_id,
      order_state: order.order_state,
      trace: trace ?? null,
      raw_order: order,
    },
  }
}
