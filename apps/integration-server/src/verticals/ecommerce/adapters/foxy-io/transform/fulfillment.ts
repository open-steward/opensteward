/**
 * Foxy.io Shipment → canonical Fulfillment.
 *
 * Foxy does not have a dedicated fulfillment resource. Shipments are embedded
 * inside transactions (orders) via `zoom=shipments`. There is no standalone
 * store-level `fx:shipments` collection endpoint; shipments are always
 * accessed through their parent transaction.
 *
 * Foxy shipments have NO tracking number, NO carrier, and NO fulfillment status
 * fields — they hold address information and a `shipping_service_description`
 * string. This transform maps what is available:
 *   - id              ← shipment id (stringified)
 *   - orderId         ← parent transaction id (stringified)
 *   - service         ← shipping_service_description
 *   - (no status, trackingNumber, carrier, or dates — not exposed by hAPI)
 *
 * Because shipments have no list endpoint, `listFulfillments` fetches the
 * most recent transactions and flattens their embedded shipments.
 *
 * Docs: https://api.foxycart.com/rels/shipment
 */

import type { Fulfillment } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFoxyShipmentFull {
  id: number | string
  /** Parent transaction (order) id, injected by the adapter before transform. */
  _transactionId?: number | string
  address_name?: string | null
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  shipping_service_id?: number | null
  shipping_service_description?: string | null
  total_item_price?: number | string | null
  total_tax?: number | string | null
  total_shipping?: number | string | null
  total_price?: number | string | null
  date_created?: string | null
  date_modified?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawFoxyShipmentFull): Fulfillment {
  return {
    id: String(raw.id),
    orderId: raw._transactionId != null ? String(raw._transactionId) : String(raw.id),
    // Foxy shipments expose no fulfillment status field.
    status: undefined,
    // Foxy shipments have no tracking number or carrier fields.
    trackingNumber: undefined,
    carrier: undefined,
    service: raw.shipping_service_description ?? undefined,
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
