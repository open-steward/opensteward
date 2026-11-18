/**
 * Brink Commerce Stock → canonical InventoryLevel.
 *
 * Shapes are the StockManagement OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/management/stock/product-variant-inventories.md:
 *  - `GET /product-variants/{productVariantId}` ("Get product variant") returns a
 *    `ProductVariant` { id, inventories: ProductVariantInventoryStock[],
 *    stockQuantity, validateStock }, each stock row being { inventoryId,
 *    quantity ("The current stock of the product for the given inventory"),
 *    created, updated };
 *  - `PUT /product-variants/{productVariantId}/inventories/{inventoryId}` returns
 *    a `ProductVariantInventory` { inventoryId, productVariantId, quantity }.
 *
 * An inventory ("Id of the inventory", `type` WAREHOUSE | STORE | DROP_SHIP |
 * INBOUND) is the canonical location, so a level's id is
 * `${productVariantId}:${inventoryId}` as the canonical schema prescribes for
 * platforms without a level id.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { InventoryLevel } from '../../../schema/inventory'

// ── Raw Brink Commerce shapes (documented fields only) ──────────────────────

/** `ProductVariantInventoryStock`: all four fields required. */
export interface RawBrinkInventoryStock {
  inventoryId: string
  quantity: number
  created: string
  updated: string
}

/** Stock service `ProductVariant`: id, inventories, stockQuantity, validateStock required. */
export interface RawBrinkVariantStock {
  id: string
  inventories: RawBrinkInventoryStock[]
  stockQuantity: number
  validateStock: boolean
}

/** `ProductVariantInventory`: inventoryId, productVariantId, quantity required. */
export interface RawBrinkInventory {
  inventoryId: string
  productVariantId: string
  quantity: number
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/** Every level of one variant, one per inventory it is stocked in. */
export function transformVariantStock(raw: RawBrinkVariantStock): InventoryLevel[] {
  return raw.inventories.map((inv) => ({
    id: `${raw.id}:${inv.inventoryId}`,
    variantId: raw.id,
    locationId: inv.inventoryId,
    available: inv.quantity,
    updatedAt: toIsoDatetime(inv.updated),
    metadata: inv as unknown as Record<string, unknown>,
  }))
}

/** The level a PUT of one variant's stock in one inventory returns. */
export function transformInventoryLevel(raw: RawBrinkInventory): InventoryLevel {
  return {
    id: `${raw.productVariantId}:${raw.inventoryId}`,
    variantId: raw.productVariantId,
    locationId: raw.inventoryId,
    available: raw.quantity,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
