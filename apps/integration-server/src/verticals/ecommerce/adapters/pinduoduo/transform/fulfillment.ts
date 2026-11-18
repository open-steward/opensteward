/**
 * Pinduoduo logistics package → canonical Fulfillment.
 *
 * PDD returns logistics/shipment data from `pdd.logistics.package.list.get`.
 * Each package corresponds to a shipment for an order. PDD does not model
 * fulfillments as a separate resource; they are projected from package data.
 *
 * Fulfillment id: `${order_sn}` or `${order_sn}:${tracking_number}` when a
 * tracking number is present, to allow for multi-package orders.
 *
 * PDD package status values:
 *   0 = UNSHIPPED    → OPEN    (package created, not yet dispatched)
 *   1 = SHIPPED      → SUCCESS (in transit)
 *   2 = DELIVERED    → SUCCESS (delivered / confirmed receipt)
 *   3 = CANCELLED    → CANCELLED
 *   4 = EXCEPTION    → ERROR
 *   5 = RETURNING    → OPEN    (return initiated)
 *   6 = RETURNED     → CANCELLED (return completed)
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { unixToIso } from './product'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawPddPackage {
  /** PDD order serial number for this package. */
  order_sn?: string
  /** Logistics tracking number (快递单号). */
  tracking_number?: string
  /** Logistics company code. */
  logistics_company?: string
  /** Logistics company name (Chinese). */
  logistics_company_name?: string
  /**
   * Package status code:
   *   0=UNSHIPPED, 1=SHIPPED, 2=DELIVERED, 3=CANCELLED, 4=EXCEPTION,
   *   5=RETURNING, 6=RETURNED
   */
  package_status?: number
  /** Package creation timestamp (Unix seconds). */
  created_time?: number
  /** Package last-updated timestamp (Unix seconds). */
  updated_time?: number
  /** Estimated delivery timestamp (Unix seconds). */
  estimated_delivery_time?: number
  /** Actual delivery timestamp (Unix seconds). */
  confirm_time?: number
  /** Warehouse / pickup location ID. */
  warehouse_id?: string | number
  /** Items in this package (sub-order SNs). */
  item_list?: Array<{ sub_order_sn?: string; [key: string]: unknown }>
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a PDD package status code to canonical FulfillmentStatus.
 */
export function mapFulfillmentStatus(status: number | undefined): FulfillmentStatus {
  if (status == null) return 'PENDING'
  switch (status) {
    case 0: // UNSHIPPED
    case 5: // RETURNING
      return 'OPEN'
    case 1: // SHIPPED
    case 2: // DELIVERED
      return 'SUCCESS'
    case 3: // CANCELLED
    case 6: // RETURNED
      return 'CANCELLED'
    case 4: // EXCEPTION
      return 'ERROR'
    default:
      return 'PENDING'
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * PDD logistics package → canonical Fulfillment.
 *
 * The order serial number (`order_sn`) is used as the fulfillment's order id.
 * The fulfillment's own id is `${order_sn}` or `${order_sn}:${tracking_number}`
 * for orders with multiple packages.
 * The complete raw package object is stored in `metadata`.
 */
export function transformFulfillment(raw: RawPddPackage): Fulfillment {
  const orderSn = raw.order_sn ?? ''
  const trackingNumber = raw.tracking_number ?? undefined
  const fulfillmentId = trackingNumber ? `${orderSn}:${trackingNumber}` : orderSn

  // Build line items from the package's item list
  const lineItems =
    raw.item_list && raw.item_list.length > 0
      ? raw.item_list
          .filter((item) => item.sub_order_sn)
          .map((item) => ({
            lineItemId: item.sub_order_sn!,
            quantity: 1,
          }))
      : undefined

  return {
    id: fulfillmentId,
    orderId: orderSn,
    status: mapFulfillmentStatus(raw.package_status),
    trackingNumber,
    carrier: raw.logistics_company_name ?? raw.logistics_company ?? undefined,
    locationId: raw.warehouse_id ? String(raw.warehouse_id) : undefined,
    lineItems: lineItems && lineItems.length > 0 ? lineItems : undefined,
    shippedAt:
      raw.package_status != null && raw.package_status >= 1
        ? unixToIso(raw.updated_time)
        : undefined,
    estimatedDeliveryAt: unixToIso(raw.estimated_delivery_time),
    deliveredAt:
      raw.package_status === 2 ? unixToIso(raw.confirm_time) : undefined,
    createdAt: unixToIso(raw.created_time),
    updatedAt: unixToIso(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a fulfillment list from a PDD package list response.
 */
export function transformFulfillments(
  rawList: RawPddPackage[] | undefined,
): Fulfillment[] {
  if (!rawList || rawList.length === 0) return []
  return rawList.map(transformFulfillment)
}
