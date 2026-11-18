/**
 * TikTok Shop SKU → canonical ProductVariant.
 *
 * TikTok Shop's "SKUs" are what other platforms call variants. Each product
 * can have multiple SKUs with different sales attributes (e.g. color x size).
 *
 * SKUs are embedded in the product response, not fetched separately.
 */

import type { ProductVariant } from '../../../schema/product'
import type { RawTikTokSku } from './product'
import { majorToMinor } from '../../../schema/shared'

// ── Re-export raw types for tests ───────────────────────────────────────────

export type { RawTikTokSku }

// ── Transform ────────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawTikTokSku,
  productId: string,
): ProductVariant {
  const price = raw.price
  const currency = price?.currency ?? 'USD'
  const salePrice = price?.sale_price ? Number(price.sale_price) : 0
  const originalPrice = price?.original_price ? Number(price.original_price) : undefined

  const optionValues: Record<string, string> = {}
  for (const attr of raw.sales_attributes ?? []) {
    if (attr.name && attr.value_name) {
      optionValues[attr.name] = attr.value_name
    }
  }

  const title = Object.values(optionValues).join(' / ') || `SKU ${raw.id ?? productId}`

  return {
    id: raw.id ?? '',
    productId,
    sku: raw.seller_sku,
    title,
    price: {
      amount: majorToMinor(salePrice, currency),
      currency,
    },
    compareAtPrice:
      originalPrice != null && originalPrice > salePrice
        ? { amount: majorToMinor(originalPrice, currency), currency }
        : undefined,
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformVariants(
  skus: RawTikTokSku[],
  productId: string,
): ProductVariant[] {
  return skus.map((sku) => transformVariant(sku, productId))
}
