/**
 * Shopee model (tier variation) → canonical ProductVariant.
 *
 * Shopee's "models" are what other platforms call variants. Each item
 * can have tier variations (e.g. color × size) and each combination
 * creates a model with its own `model_id`, SKU, stock, and price.
 *
 * API: `/api/v2/product/get_model_list?item_id=X` returns the full
 * model list for a given item.
 */

import type { ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeTierVariation {
  name: string
  option_list: Array<{
    option?: string
    image?: { image_id?: string; image_url?: string }
  }>
}

export interface RawShopeeModelPriceInfo {
  currency?: string
  original_price?: number
  current_price?: number
}

export interface RawShopeeModelStockInfo {
  stock_type?: number
  normal_stock?: number
  current_stock?: number
}

export interface RawShopeeModel {
  model_id: number
  model_sku?: string
  price_info?: RawShopeeModelPriceInfo[]
  stock_info_v2?: {
    summary_info?: {
      total_available_stock?: number
      total_reserved_stock?: number
    }
    seller_stock?: Array<{
      stock?: number
    }>
  }
  tier_index?: number[]
  [key: string]: unknown
}

export interface RawShopeeModelListResponse {
  tier_variation?: RawShopeeTierVariation[]
  model?: RawShopeeModel[]
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build option values map from tier_index + tier_variation definitions.
 * tier_index is an array like [0, 2] meaning "first option's value at
 * index 0, second option's value at index 2".
 */
function buildOptionValues(
  tierIndex: number[] | undefined,
  tierVariations: RawShopeeTierVariation[] | undefined,
): Record<string, string> | undefined {
  if (!tierIndex || !tierVariations || tierVariations.length === 0) return undefined
  const result: Record<string, string> = {}
  for (let i = 0; i < tierIndex.length && i < tierVariations.length; i++) {
    const tier = tierVariations[i]!
    const idx = tierIndex[i]!
    const value = tier.option_list[idx]?.option
    if (tier.name && value) {
      result[tier.name] = value
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function transformVariant(
  raw: RawShopeeModel,
  itemId: number,
  tierVariations?: RawShopeeTierVariation[],
): ProductVariant {
  const priceInfo = raw.price_info?.[0]
  const currency = priceInfo?.currency ?? 'USD'
  const optionValues = buildOptionValues(raw.tier_index, tierVariations)

  // Build a human-readable title from option values
  const title = optionValues
    ? Object.values(optionValues).join(' / ')
    : `Model ${raw.model_id}`

  return {
    id: String(raw.model_id),
    productId: String(itemId),
    sku: raw.model_sku,
    title,
    price: {
      amount: majorToMinor(
        priceInfo?.current_price ?? priceInfo?.original_price ?? 0,
        currency,
      ),
      currency,
    },
    compareAtPrice:
      priceInfo?.original_price != null &&
      priceInfo?.current_price != null &&
      priceInfo.original_price > priceInfo.current_price
        ? { amount: majorToMinor(priceInfo.original_price, currency), currency }
        : undefined,
    optionValues,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformVariants(
  raw: RawShopeeModelListResponse,
  itemId: number,
): ProductVariant[] {
  const models = raw.model ?? []
  const tierVariations = raw.tier_variation
  return models.map((m) => transformVariant(m, itemId, tierVariations))
}
