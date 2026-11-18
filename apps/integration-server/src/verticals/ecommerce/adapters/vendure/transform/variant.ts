/**
 * Vendure ProductVariant -> canonical ProductVariant.
 *
 * Vendure stores prices as integers in the smallest currency unit (cents).
 * Divide by 100 for canonical MoneySchema.
 */

import type { ProductVariant } from '../../../schema/product'

export interface RawVendureVariant {
  id: string
  name?: string
  sku?: string | null
  price?: number // integer cents
  priceWithTax?: number
  currencyCode?: string
  enabled?: boolean
  stockOnHand?: number
  stockAllocated?: number
  product?: { id?: string } | null
  productId?: string
  options?: Array<{ id?: string; name?: string; code?: string; group?: { name?: string; code?: string } }>
  featuredAsset?: { id?: string; preview?: string; source?: string } | null
  [key: string]: unknown
}

export function transformVariant(raw: RawVendureVariant, currency: string = 'USD'): ProductVariant {
  const priceCurrency = raw.currencyCode ?? currency
  // Vendure stores prices as integer minor units (cents) — same as canonical.
  const priceAmount = raw.price != null ? Math.round(raw.price) : 0

  const optionValues: Record<string, string> | undefined =
    raw.options && raw.options.length > 0
      ? Object.fromEntries(
          raw.options
            .filter((o) => o.group?.name || o.group?.code)
            .map((o) => [o.group?.name ?? o.group?.code ?? '', o.name ?? o.code ?? '']),
        )
      : undefined

  return {
    id: String(raw.id),
    productId: raw.product?.id != null ? String(raw.product.id) : (raw.productId != null ? String(raw.productId) : undefined),
    sku: raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price: {
      amount: priceAmount,
      currency: priceCurrency,
    },
    optionValues: optionValues && Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    name: variant.title,
    // Canonical amount is already integer cents — pass through for Vendure.
    price: variant.price?.amount != null ? Math.round(variant.price.amount) : undefined,
    enabled: true,
  }
}
