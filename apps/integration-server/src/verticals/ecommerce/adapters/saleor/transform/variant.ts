/**
 * Saleor ProductVariant → canonical ProductVariant.
 *
 * Shared between `product.ts` (nested) and the standalone variant methods.
 * Saleor pricing is channel-scoped, so the currency must be supplied.
 */

import type { ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

export interface RawSaleorVariantPricing {
  price?: { gross?: { amount?: number; currency?: string } }
}

export interface RawSaleorVariant {
  id: string
  name?: string
  sku?: string | null
  trackingNumber?: string | null
  weight?: { value?: number; unit?: string } | null
  pricing?: RawSaleorVariantPricing | null
  quantityAvailable?: number | null
  product?: { id?: string } | null
  metadata?: Array<{ key: string; value: string }> | null
  [key: string]: unknown
}

function mapWeightUnit(u: string | undefined): 'g' | 'kg' | 'oz' | 'lb' | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

export function transformVariant(raw: RawSaleorVariant, currency: string = 'USD'): ProductVariant {
  const gross = raw.pricing?.price?.gross
  const priceCurrency = gross?.currency ?? currency
  return {
    id: raw.id,
    productId: raw.product?.id ?? undefined,
    sku: raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price: {
      amount: majorToMinor(gross?.amount ?? 0, priceCurrency),
      currency: priceCurrency,
    },
    weight: raw.weight?.value ?? undefined,
    weightUnit: mapWeightUnit(raw.weight?.unit),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    name: variant.title,
    weight: variant.weight != null ? { value: variant.weight, unit: variant.weightUnit ?? 'G' } : undefined,
    trackInventory: true,
  }
}
