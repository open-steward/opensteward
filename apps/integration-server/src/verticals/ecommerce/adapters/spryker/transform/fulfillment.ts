/**
 * Spryker shipments → canonical Fulfillment.
 *
 * Spryker Glue REST API: GET /shipments (order include), no top-level
 * fulfillment endpoint for individual shipments. Shipments are accessible
 * via the `shipments` include on orders or via checkout.
 *
 * Resource type: "shipments"
 * Key attributes: shipmentMethodName, carrierName, requestedDeliveryDate,
 *   selectedShipmentMethod (name, carrierName, deliveryTime, price),
 *   shippingAddress.
 *
 * Note: Spryker does not have a standalone fulfillments/shipments top-level
 * list endpoint in the storefront Glue API — shipment data lives inside orders.
 * The adapter does not implement fulfillment methods; this file retains only
 * the raw Spryker type shapes for use by other modules.
 */

import type { JsonApiResource } from '../client'

// ── Raw Spryker shape ─────────────────────────────────────────────────────────

export interface RawSprykerShipmentMethodAttributes {
  name?: string | null
  carrierName?: string | null
  deliveryTime?: string | null
  price?: number | null
  currency?: { code?: string }
}

export interface RawSprykerShipmentAttributes {
  shipmentMethodName?: string | null
  carrierName?: string | null
  requestedDeliveryDate?: string | null
  shippingAddress?: {
    salutation?: string | null
    firstName?: string | null
    lastName?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    zipCode?: string | null
    iso2Code?: string | null
  } | null
  selectedShipmentMethod?: RawSprykerShipmentMethodAttributes | null
  [key: string]: unknown
}

/** Order-level tracking info (sometimes embedded in order attributes). */
export interface RawSprykerTrackingInfo {
  orderId?: string | null
  orderReference?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  service?: string | null
  status?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  items?: Array<{ id?: number | string; quantity?: number }>
}

export type RawSprykerShipment = JsonApiResource<RawSprykerShipmentAttributes>
