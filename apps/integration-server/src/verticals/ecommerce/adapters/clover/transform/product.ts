/**
 * Clover Item → canonical Product.
 *
 * Clover calls products "Items". Price is in integer cents.
 * Items do not have a parent-child variant model; each item is a
 * single SKU with a price.
 */

import type { Product, ProductStatus } from '../../../schema/product'

// ── Raw Clover shapes ──────────────────────────────────────────────────────

export interface RawCloverItem {
  id: string
  name?: string
  alternateName?: string
  code?: string // SKU
  sku?: string
  price?: number // integer cents
  priceType?: string // FIXED, VARIABLE, PER_UNIT
  defaultTaxRates?: boolean
  hidden?: boolean
  isRevenue?: boolean
  modifiedTime?: number // epoch ms
  createdTime?: number // epoch ms
  itemGroup?: { id?: string; name?: string }
  categories?: { elements?: Array<{ id?: string; name?: string }> }
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clover money is already in integer minor units (cents), which matches the
 * canonical `Money.amount` contract. Return it as-is (rounded to guarantee an
 * integer), defaulting a missing value to 0.
 */
export function cloverCentsToMinor(cents: number | undefined): number {
  if (cents == null) return 0
  return Math.round(cents)
}

function mapStatus(item: RawCloverItem): ProductStatus {
  if (item.hidden) return 'ARCHIVED'
  return 'ACTIVE'
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawCloverItem): Product {
  const price = cloverCentsToMinor(raw.price)
  const variant = {
    id: raw.id,
    productId: raw.id,
    sku: raw.sku ?? raw.code ?? undefined,
    title: raw.name ?? undefined,
    price: { amount: price, currency: 'USD' },
    metadata: raw as unknown as Record<string, unknown>,
  }

  return {
    id: raw.id,
    title: raw.name ?? '',
    description: raw.alternateName ?? undefined,
    status: mapStatus(raw),
    productType: raw.itemGroup?.name ?? undefined,
    variants: [variant],
    createdAt: raw.createdTime ? new Date(raw.createdTime).toISOString() : undefined,
    updatedAt: raw.modifiedTime ? new Date(raw.modifiedTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Clover item body for create/update. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
  }
  if (product.description != null) body['alternateName'] = product.description
  if (product.variants?.[0]?.sku) body['sku'] = product.variants[0].sku
  if (product.variants?.[0]?.price) {
    body['price'] = Math.round(product.variants[0].price.amount)
  }
  if (product.status === 'ARCHIVED') body['hidden'] = true
  return body
}
