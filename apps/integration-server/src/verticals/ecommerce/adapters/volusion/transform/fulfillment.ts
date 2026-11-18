/**
 * Volusion Shipment → canonical Fulfillment.
 *
 * Volusion has limited fulfillment surface — shipments are order-scoped with
 * basic tracking info. No cancel/update support.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
} from '../../../schema/fulfillment'

export interface RawVolusionShipment {
  ShipmentID: number | string
  OrderID: number | string
  ShipmentStatus?: string | null
  TrackingNumber?: string | null
  TrackingURL?: string | null
  Carrier?: string | null
  ShipmentDate?: string | null
  DateCreated?: string | null
  LastModified?: string | null
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
}

export function transformFulfillment(raw: RawVolusionShipment): Fulfillment {
  return {
    id: String(raw.ShipmentID),
    orderId: String(raw.OrderID),
    status: raw.ShipmentStatus
      ? STATUS_MAP[raw.ShipmentStatus.toLowerCase()] ?? undefined
      : undefined,
    trackingNumber: raw.TrackingNumber ?? undefined,
    trackingUrl: raw.TrackingURL ?? undefined,
    carrier: raw.Carrier ?? undefined,
    shippedAt: raw.ShipmentDate ?? undefined,
    createdAt: raw.DateCreated ?? undefined,
    updatedAt: raw.LastModified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    OrderID: fulfillment.orderId,
    TrackingNumber: fulfillment.trackingNumber,
    TrackingURL: fulfillment.trackingUrl,
    Carrier: fulfillment.carrier,
  }
}
