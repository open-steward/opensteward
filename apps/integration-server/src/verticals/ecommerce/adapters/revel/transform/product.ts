/**
 * Revel Product → canonical Product.
 *
 * Revel calls products "Products" in the `/resources/Product/` endpoint.
 * Prices are decimal strings or numbers. Products are flat (no parent-child
 * variant model) — each product maps to a single variant.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Revel shapes ──────────────────────────────────────────────────────

export interface RawRevelProduct {
  id: number
  name?: string
  description?: string
  sku?: string
  barcode?: string
  price?: number
  cost?: number
  active?: boolean
  attribute?: string // product type / category label
  category?: number | string | null
  tax_class?: number | null
  image?: string
  sort_order?: number
  created_date?: string // ISO 8601
  updated_date?: string // ISO 8601
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(product: RawRevelProduct): ProductStatus {
  if (product.active === false) return 'ARCHIVED'
  return 'ACTIVE'
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawRevelProduct): Product {
  const price = raw.price ?? 0
  const variant = {
    id: String(raw.id),
    productId: String(raw.id),
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? undefined,
    title: raw.name ?? undefined,
    price: { amount: majorToMinor(price, 'USD'), currency: 'USD' },
    metadata: raw as unknown as Record<string, unknown>,
  }

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    status: mapStatus(raw),
    productType: raw.attribute ?? undefined,
    variants: [variant],
    images: raw.image ? [{ url: raw.image }] : undefined,
    createdAt: raw.created_date ?? undefined,
    updatedAt: raw.updated_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Revel product body for create/update. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title != null) body['name'] = product.title
  if (product.description != null) body['description'] = product.description
  if (product.variants?.[0]?.sku) body['sku'] = product.variants[0].sku
  if (product.variants?.[0]?.barcode) body['barcode'] = product.variants[0].barcode
  if (product.variants?.[0]?.price) {
    body['price'] = product.variants[0].price.amount / 100
  }
  if (product.status === 'ARCHIVED') body['active'] = false
  if (product.status === 'ACTIVE') body['active'] = true
  return body
}
