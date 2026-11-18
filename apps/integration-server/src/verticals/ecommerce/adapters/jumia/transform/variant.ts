/**
 * Jumia variation → canonical ProductVariant (standalone transforms).
 *
 * Jumia variations are variants nested within products. For the `listVariants`
 * and `getVariant` methods, we re-use the product detail endpoint and
 * extract the variation data.
 */

import type { ProductVariant } from '../../../schema/product'
import { transformVariant, type RawJumiaProduct, type RawJumiaVariation } from './product'

export type { RawJumiaVariation }

/**
 * Extract all variants from a Jumia product detail response.
 */
export function extractVariants(
  product: RawJumiaProduct,
  currency = 'NGN',
): ProductVariant[] {
  const productId = String(product.product_id ?? '')
  return (product.variations ?? []).map((v) => transformVariant(v, productId, currency))
}

/**
 * Find a specific variant by SKU ID from a product detail response.
 */
export function findVariant(
  product: RawJumiaProduct,
  variantId: string,
  currency = 'NGN',
): ProductVariant | undefined {
  const productId = String(product.product_id ?? '')
  const variation = (product.variations ?? []).find(
    (v) =>
      String(v.sku_id ?? '') === variantId ||
      v.seller_sku === variantId,
  )
  if (!variation) return undefined
  return transformVariant(variation, productId, currency)
}
