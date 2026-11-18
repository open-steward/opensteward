/**
 * Bol.com Shipment → canonical Fulfillment.
 *
 * Bol.com calls fulfillments "shipments". Each shipment contains one or
 * more shipment items (order items being shipped together) and optional
 * transport info (tracking).
 *
 * Docs: https://api.bol.com/retailer/public/Retailers-Shipments.html
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawBolShipmentItem {
  orderItemId: string
  orderId?: string
  quantity?: number
}

export interface RawBolTransport {
  transportId?: string
  transporterCode?: string
  trackAndTrace?: string
  shippingLabelId?: string
}

export interface RawBolShipment {
  shipmentId: string
  shipmentDateTime?: string
  shipmentReference?: string
  shipmentItems?: RawBolShipmentItem[]
  transport?: RawBolTransport
  orderId?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferStatus(raw: RawBolShipment): FulfillmentStatus {
  if (raw.shipmentDateTime) return 'SUCCESS'
  return 'PENDING'
}

function deriveOrderId(raw: RawBolShipment): string {
  if (raw.orderId) return raw.orderId
  const first = raw.shipmentItems?.[0]
  return first?.orderId ?? 'unknown'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawBolShipment): Fulfillment {
  const lineItems = (raw.shipmentItems ?? []).map((si) => ({
    lineItemId: si.orderItemId,
    quantity: si.quantity ?? 1,
  }))

  return {
    id: String(raw.shipmentId),
    orderId: deriveOrderId(raw),
    status: inferStatus(raw),
    trackingNumber: raw.transport?.trackAndTrace,
    carrier: raw.transport?.transporterCode,
    shippedAt: raw.shipmentDateTime,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from Bol.com shipment array.
 */
export function transformFulfillments(
  items: RawBolShipment[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map(transformFulfillment)
}

/**
 * Canonical Fulfillment → Bol.com create shipment body.
 *
 * Bol.com requires order item ids and a transport mechanism.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (data.lineItems) {
    body['orderItems'] = data.lineItems.map((li) => ({
      orderItemId: li.lineItemId,
      quantity: li.quantity,
    }))
  }

  const transport: Record<string, unknown> = {}
  if (data.trackingNumber) transport['trackAndTrace'] = data.trackingNumber
  if (data.carrier) transport['transporterCode'] = data.carrier
  if (Object.keys(transport).length > 0) {
    body['transport'] = transport
  }

  return body
}
