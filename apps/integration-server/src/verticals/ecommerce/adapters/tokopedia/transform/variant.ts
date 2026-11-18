/**
 * Tokopedia variant → canonical ProductVariant.
 *
 * Tokopedia models variants as child products linked via the parent's
 * `variant.childrenID` array. Each child is a full product object
 * with its own price, stock, and SKU. The variant dimensions (e.g.
 * color, size) are stored in the `variant` field.
 *
 * Docs: https://developer.tokopedia.com/openapi/guide/#/product
 */

import type { ProductVariant } from '../../../schema/product'
import type { RawTokopediaProduct } from './product'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTokopediaVariantOption {
  name?: string
  value?: string
  hex?: string
  unitValueID?: number
}

export interface RawTokopediaVariantData {
  productID?: number
  name?: string
  sku?: string
  price?: number
  priceCurrency?: string
  stock?: number
  status?: number
  optionValues?: RawTokopediaVariantOption[]
  pictures?: Array<{ url?: string }>
  weight?: number
  weightUnit?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Transform a Tokopedia variant (child product) into a canonical ProductVariant.
 */
export function transformVariant(
  raw: RawTokopediaVariantData,
  parentProductId: number,
): ProductVariant {
  const currency = raw.priceCurrency ?? 'IDR'

  // Build option values map
  const optionValues: Record<string, string> = {}
  if (raw.optionValues) {
    for (const opt of raw.optionValues) {
      if (opt.name && opt.value) {
        optionValues[opt.name] = opt.value
      }
    }
  }

  const title = Object.keys(optionValues).length > 0
    ? Object.values(optionValues).join(' / ')
    : raw.name ?? `Variant ${raw.productID ?? 0}`

  return {
    id: String(raw.productID ?? 0),
    productId: String(parentProductId),
    sku: raw.sku,
    title,
    price: {
      amount: raw.price ?? 0,
      currency,
    },
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    weight: raw.weight,
    weightUnit: raw.weightUnit === 'GR' ? 'g' : 'kg',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a parent product's child products into canonical ProductVariants.
 */
export function transformVariantsFromProduct(
  raw: RawTokopediaProduct,
  childProducts: RawTokopediaVariantData[],
): ProductVariant[] {
  const parentId = raw.basic?.productID ?? 0
  return childProducts.map((child) => transformVariant(child, parentId))
}
