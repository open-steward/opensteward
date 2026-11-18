/**
 * Noon SKU -> canonical ProductVariant (standalone transforms).
 *
 * Noon SKUs are variants nested within products. For `listVariants` and
 * `getVariant`, we extract SKU data from the product detail response.
 *
 * Re-exports `transformVariant` from `./product.ts` and adds helpers for
 * extracting variants from product detail responses.
 */

import type { ProductVariant } from '../../../schema/product'
import { transformVariant, type RawNoonProduct, type RawNoonSku } from './product'

export type { RawNoonSku }

/**
 * Extract all variants from a Noon product detail response.
 */
export function extractVariants(
  product: RawNoonProduct,
  currency = 'AED',
): ProductVariant[] {
  const productId = String(product.product_id ?? '')
  return (product.skus ?? []).map((sku) => transformVariant(sku, productId, currency))
}

/**
 * Find a specific variant by SKU ID from a product detail response.
 */
export function findVariant(
  product: RawNoonProduct,
  variantId: string,
  currency = 'AED',
): ProductVariant | undefined {
  const productId = String(product.product_id ?? '')
  const sku = (product.skus ?? []).find(
    (s) =>
      (s.sku ?? '') === variantId ||
      (s.seller_sku ?? '') === variantId,
  )
  if (!sku) return undefined
  return transformVariant(sku, productId, currency)
}
