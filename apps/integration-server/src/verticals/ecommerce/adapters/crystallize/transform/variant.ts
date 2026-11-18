/**
 * Crystallize Variant -> canonical ProductVariant.
 *
 * Crystallize variants have price variants (per market/currency), attributes,
 * images, and stock. Shared between product.ts (nested) and standalone methods.
 */

import type { ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

export interface RawCrystallizePriceVariant {
  identifier?: string
  name?: string
  price?: number
  currency?: string
}

export interface RawCrystallizeAttribute {
  attribute?: string
  value?: string
}

export interface RawCrystallizeVariantImage {
  url?: string
  altText?: string | null
  key?: string
}

export interface RawCrystallizeVariantStock {
  location?: string
  stock?: number
}

export interface RawCrystallizeVariant {
  id: string
  name?: string
  sku?: string | null
  isDefault?: boolean
  priceVariants?: RawCrystallizePriceVariant[] | null
  attributes?: RawCrystallizeAttribute[]
  images?: RawCrystallizeVariantImage[]
  stock?: RawCrystallizeVariantStock[] | null
  /** Parent product id — passed by the adapter for standalone variant queries. */
  productId?: string | null
  [key: string]: unknown
}

function findPrice(
  priceVariants: RawCrystallizePriceVariant[] | null | undefined,
  currency: string,
): { amount: number; currency: string } {
  if (!priceVariants || priceVariants.length === 0) {
    return { amount: 0, currency }
  }
  // Prefer matching currency, then "default", then first
  const match = priceVariants.find((pv) => pv.currency === currency)
    ?? priceVariants.find((pv) => pv.identifier === 'default')
    ?? priceVariants[0]
  const matchCurrency = match?.currency ?? currency
  return {
    amount: majorToMinor(match?.price ?? 0, matchCurrency),
    currency: matchCurrency,
  }
}

function mapOptionValues(
  attrs: RawCrystallizeAttribute[] | undefined,
): Record<string, string> | undefined {
  if (!attrs || attrs.length === 0) return undefined
  const result: Record<string, string> = {}
  for (const attr of attrs) {
    if (attr.attribute && attr.value) {
      result[attr.attribute] = attr.value
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function transformVariant(raw: RawCrystallizeVariant, currency: string = 'USD'): ProductVariant {
  const price = findPrice(raw.priceVariants, currency)
  return {
    id: raw.id,
    productId: raw.productId ?? undefined,
    sku: raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price,
    optionValues: mapOptionValues(raw.attributes),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    name: variant.title,
    isDefault: false,
  }
}
