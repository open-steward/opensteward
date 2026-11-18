/**
 * KORONA ProductStock → canonical InventoryLevel.
 *
 * Shape verified against `components.schemas.ProductStock` and `Amount` on
 * https://128.koronacloud.com/web/api/v3/openapi.json:
 *   `{ amount: { actual, lent, maxLevel, ordered, reorderLevel }, product, warehouse, binLocation, listed }`.
 *
 * `amount.actual` is a standard inventory term for "actual quantity on
 * hand" and is mapped to `available`; `amount.ordered` (incoming stock on
 * order) maps to `incoming`. `amount.lent` ("lent" — items out on loan/
 * consignment) has no canonical counterpart and is not force-mapped to
 * `committed`, which means something different (reserved against open
 * sales) and isn't reported anywhere on this schema. KORONA has no
 * variant/size concept, so `variantId` is the product id.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import type { KoronaModelReference } from './product'

export interface KoronaAmount {
  actual?: number
  ordered?: number
}

export interface KoronaProductStock {
  amount?: KoronaAmount
  product: KoronaModelReference
  warehouse: KoronaModelReference
}

/** `available` is required on the canonical schema — a row with no
 *  reported `amount.actual` is dropped rather than published as zero. */
export function transformInventoryLevel(raw: KoronaProductStock): InventoryLevel | undefined {
  if (raw.amount?.actual == null) return undefined
  const variantId = raw.product.id
  const locationId = raw.warehouse.id
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.amount.actual,
    incoming: raw.amount.ordered,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
