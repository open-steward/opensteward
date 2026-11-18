/**
 * Alibaba.com order shipment → canonical Fulfillment.
 *
 * Source: "order logistics info query api" (/order/logistics/query, cid=8),
 * called per order with `trade_id` ("order id"). Its documented `value`:
 *   shipment_date { format_date, timestamp }   "Actual delivery time"
 *   logistic_status                             "Shipping Status"
 *   shipping_order_list[].voucher {
 *     tracking_number   "tracking number"
 *     logistics_type    "logistics type"
 *     service_provider  "service provider"
 *   }
 *
 * One fulfillment per `shipping_order_list` entry, with the id
 * `${trade_id}:${index}`: the list is the only documented per-shipment
 * collection and carries no id of its own, and `tracking_number` is optional.
 *
 * The docs give no set of `logistic_status` values (the example shows
 * "CONFIRM_RECEIPT"), so status is left unset and the raw value stays in
 * metadata. `shipment_date` is described as the "Actual delivery time" of the
 * whole order rather than of one shipment; it also stays in metadata.
 */

import type { Fulfillment } from '../../../schema/fulfillment'

export interface RawAlibabaVoucher {
  tracking_number?: string
  logistics_type?: string
  service_provider?: string
}

export interface RawAlibabaShippingOrder {
  voucher?: RawAlibabaVoucher
  [key: string]: unknown
}

/** /order/logistics/query `value`. */
export interface RawAlibabaLogistics {
  shipment_date?: { format_date?: string; timestamp?: number | string }
  logistic_status?: string
  shipping_order_list?: RawAlibabaShippingOrder[]
  [key: string]: unknown
}

export function fulfillmentId(tradeId: string, index: number): string {
  return `${tradeId}:${index}`
}

/** Split a fulfillment id back into the order id and the shipment index. */
export function parseFulfillmentId(id: string): { tradeId: string; index: number } | undefined {
  const at = id.lastIndexOf(':')
  if (at <= 0) return undefined
  const index = Number(id.slice(at + 1))
  if (!Number.isInteger(index) || index < 0) return undefined
  return { tradeId: id.slice(0, at), index }
}

/** One shipment of one order → Fulfillment. */
export function transformFulfillment(
  tradeId: string,
  index: number,
  shipment: RawAlibabaShippingOrder,
  logistics: RawAlibabaLogistics,
): Fulfillment {
  const v = shipment.voucher ?? {}
  return {
    id: fulfillmentId(tradeId, index),
    orderId: tradeId,
    trackingNumber: v.tracking_number || undefined,
    carrier: v.service_provider || undefined,
    service: v.logistics_type || undefined,
    metadata: {
      ...(shipment as Record<string, unknown>),
      logistic_status: logistics.logistic_status,
      shipment_date: logistics.shipment_date,
    },
  }
}

/** Every shipment of one order, in the order the API lists them. */
export function transformFulfillments(
  tradeId: string,
  logistics: RawAlibabaLogistics,
): Fulfillment[] {
  return (logistics.shipping_order_list ?? []).map((s, i) =>
    transformFulfillment(tradeId, i, s, logistics),
  )
}
