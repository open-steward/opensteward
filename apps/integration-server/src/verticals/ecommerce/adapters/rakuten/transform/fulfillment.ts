/**
 * Rakuten RMS package / shipment → canonical Fulfillment.
 *
 * Rakuten models shipping at the "package" level (`packageList` in an order).
 * Each package may have a tracking number (`shipInquiryNo`) and a delivery
 * service name (`deliveryService`).
 *
 * Fulfillment id format: `${orderNumber}:${packageId}` — or
 * `${orderNumber}:0` when packageId is absent.
 *
 * Status mapping from order progress:
 *   100–200 = PENDING
 *   300     = OPEN
 *   400+    = SUCCESS
 *   500/600 = CANCELLED
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RakutenOrder, RakutenOrderPackage } from './order'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map Rakuten orderProgress to canonical FulfillmentStatus.
 */
export function mapFulfillmentStatus(orderProgress: number | undefined): FulfillmentStatus {
  if (orderProgress === undefined || orderProgress === null) return 'PENDING'
  if (orderProgress <= 200) return 'PENDING'
  if (orderProgress === 300) return 'OPEN'
  if (orderProgress >= 400 && orderProgress < 500) return 'SUCCESS'
  if (orderProgress === 500 || orderProgress === 600) return 'CANCELLED'
  return 'PENDING'
}

/**
 * Build a fulfillment from an order + one of its packages.
 */
function transformPackage(order: RakutenOrder, pkg: RakutenOrderPackage, index: number): Fulfillment {
  const packageId = pkg.packageId != null ? String(pkg.packageId) : String(index)
  const fulfillmentId = `${order.orderNumber}:${packageId}`

  const lineItems = (pkg.detailList ?? []).map((detail) => ({
    lineItemId: detail.itemDetailId != null ? String(detail.itemDetailId) : String(detail.itemId ?? index),
    quantity: detail.units ?? 1,
  }))

  const status = mapFulfillmentStatus(order.orderProgress)

  return {
    id: fulfillmentId,
    orderId: order.orderNumber,
    status,
    trackingNumber: pkg.shipInquiryNo,
    carrier: pkg.deliveryService,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippedAt:
      order.orderProgress != null && order.orderProgress >= 400
        ? (order.lastupdateDatetime ?? undefined)
        : undefined,
    createdAt: order.orderDatetime ?? undefined,
    updatedAt: order.lastupdateDatetime ?? undefined,
    metadata: {
      orderNumber: order.orderNumber,
      orderProgress: order.orderProgress,
      packageId: pkg.packageId,
      raw_package: pkg,
    },
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Build one Fulfillment per package in the order.
 * Returns an empty array if the order has no packages.
 */
export function transformFulfillments(order: RakutenOrder): Fulfillment[] {
  const packages = order.packageList ?? []
  if (packages.length === 0) {
    // Synthesise a single fulfillment from the order itself
    return [
      {
        id: `${order.orderNumber}:0`,
        orderId: order.orderNumber,
        status: mapFulfillmentStatus(order.orderProgress),
        createdAt: order.orderDatetime ?? undefined,
        updatedAt: order.lastupdateDatetime ?? undefined,
        metadata: {
          orderNumber: order.orderNumber,
          orderProgress: order.orderProgress,
        },
      },
    ]
  }
  return packages.map((pkg, i) => transformPackage(order, pkg, i))
}

/**
 * Build a single Fulfillment from an order and a specific package.
 * Used when only one package is needed (e.g. `getFulfillment`).
 */
export function transformFulfillment(order: RakutenOrder, pkg: RakutenOrderPackage): Fulfillment {
  return transformPackage(order, pkg, 0)
}
