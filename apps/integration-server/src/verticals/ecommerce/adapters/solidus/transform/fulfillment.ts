/**
 * Solidus Shipment -> canonical Fulfillment.
 *
 * Solidus shipments are identical to Spree shipments under
 * `/api/v2/platform/shipments`:
 *  - `state`: pending | ready | shipped | canceled
 *  - `tracking`: tracking number
 *  - `shipping_rates` / `selected_shipping_rate` for carrier info
 *  - `inventory_units[]` linking to line items
 *
 * Solidus-specific:
 *  - `adjustments` may include shipping adjustments inline
 *  - `manifest` field provides a grouped view of items
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSolidusInventoryUnit {
  id?: number | string
  variant_id?: number | string
  line_item_id?: number | string
  quantity?: number
  state?: string
  [key: string]: unknown
}

export interface RawSolidusShippingRate {
  id?: number | string
  name?: string
  cost?: string | number
  selected?: boolean
  shipping_method_id?: number | string
  [key: string]: unknown
}

export interface RawSolidusShipment {
  id: number | string
  order_id?: number | string
  number?: string
  state?: string // pending | ready | shipped | canceled
  tracking?: string | null
  shipped_at?: string | null
  cost?: string | number
  stock_location_id?: number | string | null
  inventory_units?: RawSolidusInventoryUnit[]
  selected_shipping_rate?: RawSolidusShippingRate | null
  shipping_rates?: RawSolidusShippingRate[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): FulfillmentStatus | undefined {
  switch (state) {
    case 'pending':
      return 'PENDING'
    case 'ready':
      return 'OPEN'
    case 'shipped':
      return 'SUCCESS'
    case 'canceled':
      return 'CANCELLED'
    default:
      return undefined
  }
}

function mapLineItems(
  units: RawSolidusInventoryUnit[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!units || units.length === 0) return undefined
  // Group by line_item_id and sum quantities
  const grouped = new Map<string, number>()
  for (const unit of units) {
    if (unit.line_item_id == null) continue
    const key = String(unit.line_item_id)
    grouped.set(key, (grouped.get(key) ?? 0) + (unit.quantity ?? 1))
  }
  return Array.from(grouped.entries()).map(([lineItemId, quantity]) => ({
    lineItemId,
    quantity,
  }))
}

export function transformFulfillment(raw: RawSolidusShipment): Fulfillment {
  const selectedRate = raw.selected_shipping_rate
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : '',
    status: mapStatus(raw.state),
    trackingNumber: raw.tracking ?? undefined,
    carrier: selectedRate?.name ?? undefined,
    locationId: raw.stock_location_id != null ? String(raw.stock_location_id) : undefined,
    lineItems: mapLineItems(raw.inventory_units),
    shippedAt: toIsoDatetime(raw.shipped_at),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    shipment: {
      tracking: fulfillment.trackingNumber,
      stock_location_id: fulfillment.locationId
        ? Number(fulfillment.locationId)
        : undefined,
    },
  }
}
