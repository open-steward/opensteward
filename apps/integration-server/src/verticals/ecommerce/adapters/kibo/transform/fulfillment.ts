/**
 * Kibo Commerce Fulfillment → canonical Fulfillment.
 *
 * Kibo models fulfillments as shipping packages nested on orders.
 * Each package in `order.packages[]` corresponds to a shipment.
 *
 * Endpoint:
 *   GET /api/commerce/orders/{orderId}/packages
 *   GET /api/commerce/orders/{orderId}/packages/{packageId}
 *
 * Key fields (from packages):
 *   - `id` / `packageId`          → id
 *   - `orderId`                    → orderId
 *   - `status`                     → status
 *   - `trackingNumber`             → trackingNumber
 *   - `carrier`                    → carrier
 *   - `shippingMethodName`         → service
 *   - `items[]`                    → lineItems
 *   - `fulfilledDate`              → shippedAt
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawKiboPackageItem {
  orderItemId?: string
  quantity?: number
  [key: string]: unknown
}

export interface RawKiboPackage {
  id?: string
  packageId?: string
  orderId?: string
  status?: string
  packagingType?: string
  trackingNumber?: string
  carrier?: string
  shippingMethodCode?: string
  shippingMethodName?: string
  items?: RawKiboPackageItem[]
  fulfillmentDate?: string
  auditInfo?: { createDate?: string; updateDate?: string }
  [key: string]: unknown
}

function mapStatus(s: string | undefined): FulfillmentStatus | undefined {
  const v = (s ?? '').toLowerCase()
  if (v === 'fulfilled' || v === 'delivered' || v === 'completed') return 'SUCCESS'
  if (v === 'cancelled' || v === 'canceled') return 'CANCELLED'
  if (v === 'attempted_delivery' || v === 'error' || v === 'failure') return 'ERROR'
  if (v === 'in_transit' || v === 'shipped' || v === 'picked_up' || v === 'awaiting_pickup') return 'OPEN'
  if (v === 'pending' || v === 'ready') return 'PENDING'
  return undefined
}

export function transformFulfillment(raw: RawKiboPackage, orderId?: string): Fulfillment {
  const id = raw.id ?? raw.packageId ?? ''
  const oid = raw.orderId ?? orderId ?? ''

  return {
    id,
    orderId: oid,
    status: mapStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrier: raw.carrier ?? undefined,
    service: raw.shippingMethodName ?? raw.shippingMethodCode ?? undefined,
    lineItems: (raw.items ?? []).length > 0
      ? (raw.items ?? []).map((item) => ({
          lineItemId: item.orderItemId ?? '',
          quantity: item.quantity ?? 1,
        }))
      : undefined,
    shippedAt: raw.fulfillmentDate ?? undefined,
    createdAt: raw.auditInfo?.createDate ?? undefined,
    updatedAt: raw.auditInfo?.updateDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
