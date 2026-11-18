/**
 * Drupal Commerce inventory → canonical InventoryLevel.
 *
 * Drupal Commerce does not have a dedicated JSON:API inventory resource in its
 * core module. Inventory is managed via the `commerce_stock` contrib module,
 * which exposes a `commerce_stock_location--default` resource and links stock
 * levels on variations.
 *
 * This adapter maps the variation's stock level information where available.
 * If the stock module is not installed, inventory levels are synthesized from
 * variation attributes using `field_stock` or similar custom fields.
 *
 * `commerce_stock_location--online` attributes:
 *   - `name`            — location display name
 *   - `status`          — boolean
 *
 * Variation stock (from stock module) is typically embedded as:
 *   - `attributes.field_stock`   — integer stock count on the variation
 *
 * Since there is no first-class inventory-level resource, the adapter
 * synthesises an id as `{variantId}:{locationId}` per the canonical schema
 * recommendation.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { Location } from '../../../schema/location'
import type { JsonApiResource } from '../client'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalStockLocationAttributes {
  name?: string
  status?: boolean | number
  [key: string]: unknown
}

export type DrupalStockLocation = JsonApiResource & {
  attributes: DrupalStockLocationAttributes
}

export interface DrupalVariationStockAttributes {
  sku?: string
  field_stock?: number | null
  field_inventory?: number | null
  [key: string]: unknown
}

export type DrupalVariationStock = JsonApiResource & {
  attributes: DrupalVariationStockAttributes
}

// ── Location transform ────────────────────────────────────────────────────────

function isActive(status: boolean | number | undefined): boolean {
  if (status == null) return true
  if (typeof status === 'boolean') return status
  return status !== 0
}

export function transformLocation(raw: DrupalStockLocation): Location {
  const attrs = raw.attributes
  return {
    id: raw.id,
    name: attrs.name ?? 'Default Location',
    active: isActive(attrs.status),
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Inventory level transform ─────────────────────────────────────────────────

/**
 * Build an InventoryLevel from a variation resource that has stock field(s).
 * Since Drupal Commerce stock is typically per-variation (not per-location),
 * a synthetic `locationId` of `"default"` is used unless the caller provides one.
 */
export function transformInventoryLevel(
  raw: DrupalVariationStock,
  locationId = 'default',
): InventoryLevel {
  const attrs = raw.attributes
  const available = attrs.field_stock ?? attrs.field_inventory ?? 0

  return {
    id: `${raw.id}:${locationId}`,
    variantId: raw.id,
    locationId,
    available: typeof available === 'number' ? available : parseInt(String(available), 10) || 0,
    onHand: typeof available === 'number' ? available : parseInt(String(available), 10) || 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build an InventoryLevel from explicit data (when updating).
 * Used by setInventoryLevel / adjustInventoryLevel.
 */
export function buildInventoryLevel(data: {
  variantId: string
  locationId: string
  available: number
  raw?: JsonApiResource
}): InventoryLevel {
  return {
    id: `${data.variantId}:${data.locationId}`,
    variantId: data.variantId,
    locationId: data.locationId,
    available: data.available,
    onHand: data.available,
    updatedAt: new Date().toISOString(),
    metadata: data.raw
      ? (data.raw as unknown as Record<string, unknown>)
      : {
          variantId: data.variantId,
          locationId: data.locationId,
          available: data.available,
          synthetic: true,
        },
  }
}
