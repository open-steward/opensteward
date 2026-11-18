/**
 * PlentyONE Order Shipping Package → canonical Fulfillment.
 *
 * PlentyONE models shipments as "shipping packages" associated with an order.
 * A package can have one or more tracking numbers and is linked to a warehouse
 * (locationId). Package status comes from the parent order's status.
 *
 * Endpoints used:
 *   GET /rest/orders/{orderId}/shipping/packages
 *   GET /rest/orders/{orderId}/shipping/packages/{packageId}
 *   POST /rest/orders/{orderId}/shipping/packages
 *   DELETE /rest/orders/{orderId}/shipping/packages/{packageId}
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneShippingPackageOrderItem {
  orderItemId?: number | string
  quantity?: number
}

export interface RawPlentyOneShippingPackage {
  id: number | string
  orderId?: number | string
  packageNumber?: string | null
  labelUrl?: string | null
  carrier?: string | null
  carrierServiceId?: number | null
  warehouseId?: number | string | null
  status?: string | null
  shipmentDate?: string | null
  deliveryDate?: string | null
  createdAt?: string
  updatedAt?: string
  orderItems?: RawPlentyOneShippingPackageOrderItem[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  open: 'OPEN',
  registered: 'PENDING',
  sent: 'SUCCESS',
  success: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
}

function mapLineItems(
  items: RawPlentyOneShippingPackageOrderItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items
    .filter((i) => i.orderItemId != null)
    .map((i) => ({ lineItemId: String(i.orderItemId), quantity: i.quantity ?? 1 }))
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformShippingPackage(
  raw: RawPlentyOneShippingPackage,
  orderId: string,
): Fulfillment {
  return {
    id: String(raw.id),
    orderId: raw.orderId != null ? String(raw.orderId) : orderId,
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.packageNumber ?? undefined,
    trackingUrl: raw.labelUrl ?? undefined,
    carrier: raw.carrier ?? undefined,
    locationId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    lineItems: mapLineItems(raw.orderItems),
    shippedAt: toIsoDatetime(raw.shipmentDate),
    estimatedDeliveryAt: toIsoDatetime(raw.deliveryDate),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → PlentyONE shipping package body for create. */
export function untransformShippingPackage(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    packageNumber: fulfillment.trackingNumber,
    carrier: fulfillment.carrier,
    warehouseId: fulfillment.locationId ? Number(fulfillment.locationId) : undefined,
    orderItems: fulfillment.lineItems?.map((li) => ({
      orderItemId: Number(li.lineItemId),
      quantity: li.quantity,
    })),
  }
}
