/**
 * Daraz SKU → canonical ProductVariant (standalone transforms).
 *
 * Daraz SKUs are variants nested within products. For the `listVariants`
 * and `getVariant` methods, we re-use the product detail endpoint and
 * extract the SKU data.
 *
 * This module re-exports `transformVariant` from `./product.ts` for
 * consistency, and adds helpers for extracting variants from product
 * detail responses.
 */

import type { ProductVariant } from '../../../schema/product'
import { transformVariant, type RawDarazProduct, type RawDarazSku } from './product'

export type { RawDarazSku }

/**
 * Extract all variants from a Daraz product detail response.
 */
export function extractVariants(
  product: RawDarazProduct,
  currency = 'USD',
): ProductVariant[] {
  const productId = String(product.item_id ?? '')
  return (product.skus ?? []).map((sku) => transformVariant(sku, productId, currency))
}

/**
 * Find a specific variant by SKU ID from a product detail response.
 */
export function findVariant(
  product: RawDarazProduct,
  variantId: string,
  currency = 'USD',
): ProductVariant | undefined {
  const productId = String(product.item_id ?? '')
  const sku = (product.skus ?? []).find(
    (s) =>
      String(s.SkuId ?? '') === variantId ||
      s.SellerSku === variantId ||
      s.ShopSku === variantId,
  )
  if (!sku) return undefined
  return transformVariant(sku, productId, currency)
}
