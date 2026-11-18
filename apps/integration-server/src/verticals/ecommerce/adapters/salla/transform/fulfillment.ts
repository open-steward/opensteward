/**
 * Salla Shipment → canonical Fulfillment.
 *
 * Salla shipment fields (from /admin/v2/shipments):
 *  - id (string), type, status, tracking_number, tracking_link, tracking_url
 *  - courier_id, courier_name
 *  - ship_to, ship_from (ShippingAddress)
 *  - packages[] with item_id, sku, quantity
 *  - payment_method
 *  - total (Price)
 *
 * Note: Salla shipments don't always include order_id directly; it may be
 * passed as a filter param. We store it in metadata when available.
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaShipmentAddress {
  name?: string
  country?: string
  country_code?: string
  city?: string
  address_line?: string
  postal_code?: string
}

export interface RawSallaShipmentPackage {
  item_id?: number | string
  external_id?: number | string
  name?: string
  sku?: string
  price?: { amount: number; currency: string }
  quantity?: number
}

export interface RawSallaShipment {
  id: number | string
  order_id?: number | string | null
  type?: string
  status?: string
  tracking_number?: string | null
  tracking_link?: string | null
  tracking_url?: string | null
  shipping_number?: string | null
  courier_id?: number | string
  courier_name?: string | null
  courier_logo?: string | null
  ship_to?: RawSallaShipmentAddress
  ship_from?: RawSallaShipmentAddress
  packages?: RawSallaShipmentPackage[]
  payment_method?: string
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  created: 'PENDING',
  in_progress: 'OPEN',
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  returned: 'CANCELLED',
  error: 'ERROR',
  failed: 'FAILURE',
}

function mapPackages(
  packages: RawSallaShipmentPackage[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!packages || packages.length === 0) return undefined
  return packages
    .filter((p) => p.item_id != null)
    .map((p) => ({
      lineItemId: String(p.item_id),
      quantity: p.quantity ?? 1,
    }))
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawSallaShipment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : '',
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    trackingUrl: raw.tracking_url ?? raw.tracking_link ?? undefined,
    carrier: raw.courier_name ?? undefined,
    lineItems: mapPackages(raw.packages),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Salla shipment body (for create). */
export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    tracking_number: fulfillment.trackingNumber,
    tracking_url: fulfillment.trackingUrl,
    courier_name: fulfillment.carrier,
    packages: fulfillment.lineItems?.map((li) => ({
      item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
