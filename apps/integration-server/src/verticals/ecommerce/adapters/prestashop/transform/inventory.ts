/**
 * PrestaShop stock_available → canonical InventoryLevel.
 *
 * PrestaShop manages stock via `/api/stock_availables`. Each record is
 * keyed by product + combination + shop. The `quantity` field holds the
 * available stock count.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawPrestaShopStockAvailable {
  id: number | string
  id_product?: number | string
  id_product_attribute?: number | string
  id_shop?: number | string
  quantity?: number | string | null
  depends_on_stock?: string | number
  out_of_stock?: string | number
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawPrestaShopStockAvailable,
  productId?: string,
): InventoryLevel {
  const pid = productId ?? (raw.id_product != null ? String(raw.id_product) : '')
  const combinationId = raw.id_product_attribute != null && raw.id_product_attribute !== '0' && raw.id_product_attribute !== 0
    ? String(raw.id_product_attribute)
    : 'default'
  const variantId = `${pid}:${combinationId}`
  const qty = raw.quantity != null
    ? (typeof raw.quantity === 'string' ? parseInt(raw.quantity, 10) : raw.quantity)
    : 0

  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: qty,
    metadata: raw as Record<string, unknown>,
  }
}
