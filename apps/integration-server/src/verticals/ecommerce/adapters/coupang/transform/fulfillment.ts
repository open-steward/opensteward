/**
 * Coupang order sheet (PO) shipping info → canonical Fulfillment.
 *
 * Coupang documents no shipment or fulfillment resource of its own. Each
 * order sheet (one shipment box) carries its shipping fields:
 * "deliveryCompanyName | string | Courier companies", "invoiceNumber |
 * string | Invoice No.", "inTrasitDateTime | string | shipment date
 * (shipped-out date)" and "deliveredDate | string | delivery-completed date"
 * (https://developers.coupang.com/en/api/shipments/single-po-query-using-shipmentboxid).
 *
 * So a box that has shipped is one fulfillment of the canonical order with
 * the same id (see `order.ts`: the canonical order is the shipment box).
 * A box that has not shipped (ACCEPT, INSTRUCT) has none, and NONE_TRACKING
 * does not say whether it has shipped, so it has none either.
 */

import type { Fulfillment } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'
import { lineItemId, orderSheetId, type RawCoupangOrder } from './order'

/** DEPARTURE "Shipment commenced", DELIVERING "In transit", FINAL_DELIVERY "Delivery completed". */
const SHIPPED = new Set(['DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'])

/**
 * The single-PO page documents inTrasitDateTime and deliveredDate as
 * "yyyy-MM-dd HH:mm:ss", with no offset, while its example carries one
 * ("2025-01-15T14:17:13.973885-08:00"). The docs name no zone for the
 * offset-less form, so only a value that carries its own offset (or Z) is
 * published; any other is left out (it stays in metadata) rather than read
 * as UTC or as Korean time.
 */
const WITH_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/

function datetimeWithOffset(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || !WITH_OFFSET.test(value.trim())) return undefined
  return toIsoDatetime(value)
}

/** Whether this order sheet's status says the box has shipped. */
export function hasShipped(raw: RawCoupangOrder): boolean {
  return raw.status !== undefined && SHIPPED.has(raw.status)
}

/** The fulfillment of a shipped order sheet. Throws for one that has not shipped. */
export function transformFulfillment(raw: RawCoupangOrder): Fulfillment {
  const id = orderSheetId(raw)
  if (!hasShipped(raw)) {
    throw new Error(`Coupang order sheet ${id} has not shipped (status ${String(raw.status)})`)
  }
  return {
    id,
    orderId: id,
    status: 'SUCCESS',
    trackingNumber: raw.invoiceNumber || undefined,
    carrier: raw.deliveryCompanyName || undefined,
    lineItems: (raw.orderItems ?? []).map((item) => {
      if (typeof item.shippingCount !== 'number') {
        throw new Error(`Coupang order sheet ${id} has an item with no shippingCount`)
      }
      return { lineItemId: lineItemId(id, item), quantity: item.shippingCount }
    }),
    shippedAt: datetimeWithOffset(raw.inTrasitDateTime),
    deliveredAt: datetimeWithOffset(raw.deliveredDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
