/**
 * eBay Inventory Item (SKU, in the context of a group) → canonical ProductVariant.
 *
 * ── How this relates to Product (transform/product.ts) ──────────────────────
 *
 * eBay variants ARE inventory items — the exact same entity `transform/
 * product.ts` maps to canonical Product for a standalone SKU. What makes a
 * SKU a "variant" rather than a bare product is group membership:
 *
 *   - `GET /inventory_item/{sku}` returns `inventoryItemGroupKeys` when the
 *     SKU belongs to an `inventory_item_group`.
 *   - `GET /inventory_item_group/{key}` returns `variantSKUs`, the member
 *     list, for the parent "product with options".
 *
 * `ProductVariant.productId` = the `inventoryItemGroupKey`. `ProductVariant.
 * id` = the SKU, same as `Product.id` — a SKU that is part of a variation
 * group is legitimately reachable through both `/products/{sku}` (as a bare
 * item) and `/variants/{sku}` (in its group context); that overlap mirrors
 * eBay's own data model rather than a modelling mistake here.
 *
 * eBay's InventoryItem carries no price — price lives on the (unimplemented)
 * Offer resource — so `price` defaults to `{ amount: 0, currency: 'USD' }`
 * until offers are mapped, matching this vertical's convention for
 * platforms whose variant-equivalent resource has no price field (see e.g.
 * adapters/elasticpath, adapters/shuup).
 */

import type { ProductVariant, WeightUnit } from '../../../schema/product'
import type { RawEbayInventoryItem } from './product'

// ── Raw shapes ───────────────────────────────────────────────────────────────

/**
 * `InventoryItemGroup` — GET/PUT/DELETE `/inventory_item_group/{key}`.
 * There is no unscoped list; a group is only reachable by key.
 */
export interface RawEbayInventoryItemGroup {
  inventoryItemGroupKey?: string
  title?: string
  description?: string
  aspects?: Record<string, string[]>
  /** Member SKUs — each one a variant of this group. */
  variantSKUs?: string[]
  imageUrls?: string[]
  videoIds?: string[]
  subtitle?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEIGHT_UNITS: Record<string, WeightUnit> = {
  POUND: 'lb',
  OUNCE: 'oz',
  KILOGRAM: 'kg',
  GRAM: 'g',
}

function mapWeightUnit(unit: string | undefined): WeightUnit | undefined {
  if (!unit) return undefined
  return WEIGHT_UNITS[unit]
}

function extractOptionValues(
  aspects: Record<string, string[]> | undefined,
): Record<string, string> | undefined {
  if (!aspects) return undefined
  const entries = Object.entries(aspects)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => [name, values[0]!] as const)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * eBay Inventory Item → canonical ProductVariant.
 *
 * `productId` is normally passed by the caller (the group key the item was
 * fetched under, in `listVariants`); when omitted it falls back to the
 * item's own `inventoryItemGroupKeys[0]` (used by `getVariant`, which has no
 * other source for it).
 */
export function transformVariant(
  raw: RawEbayInventoryItem,
  productId?: string,
): ProductVariant {
  const product = raw.product
  const weight = raw.packageWeightAndSize?.weight

  return {
    id: raw.sku,
    productId: productId ?? raw.inventoryItemGroupKeys?.[0],
    sku: raw.sku,
    title: product?.title ?? raw.sku,
    price: { amount: 0, currency: 'USD' },
    weight: weight?.value,
    weightUnit: mapWeightUnit(weight?.unit),
    optionValues: extractOptionValues(product?.aspects),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
