/**
 * Tray Multi-CD stock → canonical InventoryLevel.
 *
 * Verified with curl against developers.tray.com.br (see `client.ts`
 * header):
 *
 *   - GET (`#consultar-estoque-de-produto-do-cd-get`):
 *     `GET /multicd/stock/detailed/product/:id?access_token=` — `:id` is
 *     the PRODUCT id, not a variant id. Response:
 *     `{"message":"success","data":[{"dc_id":1,"stock":7},{"dc_id":3,"stock":99}],"code":200}`
 *     — one row per distribution center holding this product, no
 *     variant-level breakdown documented.
 *   - PUT (`#atualizar-estoque-do-cd-put`):
 *     `PUT /multicd/distribution-centers/{id}/stock?access_token=` — `{id}`
 *     is the DISTRIBUTION CENTER id (path), body is plain JSON
 *     `{"product_id": 10, "stock": 2, "handling_days": 3}` (the docs also
 *     document `variation_id` or `reference` as alternatives to
 *     `product_id`, whichever one field is set). Response:
 *     `{"message":"success","data":[],"code":200}`.
 *
 * `variantId` on the canonical shape is populated with the product id,
 * matching this endpoint's actual scope — Tray's docs do not demonstrate a
 * variant-scoped stock read, only product-scoped (mirrors how other
 * adapters in this vertical use `variantId` as the closest available
 * identifier when the platform's own inventory API is keyed by product,
 * not variant — see the Shopify adapter's `inventory_item_id` comment for
 * the same pattern).
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawTrayCdStock {
  dc_id: number | string
  stock: number | string
}

export function transformInventoryLevel(productId: string, raw: RawTrayCdStock): InventoryLevel {
  const available = typeof raw.stock === 'string' ? parseInt(raw.stock, 10) : raw.stock
  return {
    id: `${productId}:${raw.dc_id}`,
    variantId: productId,
    locationId: String(raw.dc_id),
    available: Number.isFinite(available) ? available : 0,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
