/**
 * Etsy Receipt shipments → canonical Fulfillment.
 *
 * Etsy embeds shipment tracking info on receipts. Each receipt can have
 * a `shipments` array with tracking numbers and carrier names. Shipments
 * are created by POSTing to `/shops/{shopId}/receipts/{receiptId}/tracking`.
 *
 * Fulfillment id format: `${receiptId}:${shipmentIndex}` — Etsy shipments
 * don't have a dedicated id field, so we use the array index.
 *
 * For receipts without shipments, we project a single PENDING fulfillment
 * from the receipt itself when the receipt has transactions (line items).
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawEtsyReceipt, RawEtsyTransaction } from './order'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEtsyShipment {
  receipt_shipping_id?: number
  shipment_notification_timestamp?: number
  carrier_name?: string
  tracking_code?: string
  tracking_url?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tsToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

function inferStatus(receipt: RawEtsyReceipt, hasShipment: boolean): FulfillmentStatus {
  if (receipt.is_shipped === true || receipt.status === 'completed') return 'SUCCESS'
  if (hasShipment) return 'OPEN'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform a single Etsy shipment into a canonical Fulfillment.
 */
export function transformFulfillment(
  receipt: RawEtsyReceipt,
  shipment: RawEtsyShipment,
  index: number,
): Fulfillment {
  const receiptId = String(receipt.receipt_id)
  const id = shipment.receipt_shipping_id != null
    ? `${receiptId}:${shipment.receipt_shipping_id}`
    : `${receiptId}:${index}`

  // Build line items from the receipt's transactions
  const lineItems = (receipt.transactions ?? []).map((tx: RawEtsyTransaction) => ({
    lineItemId: String(tx.transaction_id),
    quantity: tx.quantity ?? 1,
  }))

  return {
    id,
    orderId: receiptId,
    status: inferStatus(receipt, true),
    trackingNumber: shipment.tracking_code ?? undefined,
    trackingUrl: shipment.tracking_url ?? undefined,
    carrier: shipment.carrier_name ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt: tsToIso(shipment.shipment_notification_timestamp),
    metadata: {
      shipment,
      receipt_id: receipt.receipt_id,
    },
  }
}

/**
 * Build fulfillment list for a receipt. If the receipt has shipments,
 * each one becomes a fulfillment. If not, a single PENDING fulfillment
 * is projected from the receipt's transactions.
 */
export function transformFulfillments(receipt: RawEtsyReceipt): Fulfillment[] {
  const shipments = (receipt.shipments ?? []) as RawEtsyShipment[]
  const receiptId = String(receipt.receipt_id)

  if (shipments.length > 0) {
    return shipments.map((s, i) => transformFulfillment(receipt, s, i))
  }

  // No shipments yet — project a single PENDING fulfillment
  const lineItems = (receipt.transactions ?? []).map((tx: RawEtsyTransaction) => ({
    lineItemId: String(tx.transaction_id),
    quantity: tx.quantity ?? 1,
  }))

  return [
    {
      id: `${receiptId}:pending`,
      orderId: receiptId,
      status: 'PENDING' as FulfillmentStatus,
      lineItems: lineItems.length > 0 ? lineItems : undefined,
      metadata: { receipt_id: receipt.receipt_id },
    },
  ]
}
