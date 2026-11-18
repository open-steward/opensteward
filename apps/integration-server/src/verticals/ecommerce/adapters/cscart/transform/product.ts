/**
 * CS-Cart Product / Combination (variant) → canonical Product / ProductVariant.
 *
 * CS-Cart product status codes:
 *  - `A` = Active  → ACTIVE
 *  - `D` = Disabled → DRAFT
 *  - `H` = Hidden  → ARCHIVED
 *
 * Prices are string-encoded decimals. Images live under `main_pair` (primary)
 * and `images[]` (gallery). Product options (variants) are fetched separately
 * from `/products/{id}/combinations` and passed in via the optional `combinations`
 * field on the raw product shape.
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw CS-Cart shapes ───────────────────────────────────────────────────────

export interface CsCartImagePair {
  detailed?: {
    image_path?: string
    image_x?: number | string
    image_y?: number | string
    alt?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface CsCartProductOption {
  option_id?: number | string
  option_name?: string
  variants?: Array<{ variant_id?: number | string; variant_name?: string }>
  [key: string]: unknown
}

export interface CsCartCombination {
  combination_id: number | string
  product_id?: number | string
  combination?: string
  price?: string | number
  list_price?: string | number
  amount?: number | string | null
  product_code?: string | null
  status?: string
  [key: string]: unknown
}

export interface CsCartProduct {
  product_id: number | string
  product: string
  full_description?: string | null
  short_description?: string | null
  price?: string | number
  list_price?: string | number
  status?: string
  main_category?: number | string | null
  category_ids?: Array<number | string>
  amount?: number | string | null
  product_code?: string | null
  timestamp?: number | string
  updated_timestamp?: number | string
  main_pair?: CsCartImagePair | null
  images?: CsCartImagePair[]
  product_features?: Record<string, unknown>
  combinations?: CsCartCombination[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(s: string | null | undefined): ProductStatus | undefined {
  if (!s) return undefined
  switch (s.toUpperCase()) {
    case 'A':
      return 'ACTIVE'
    case 'D':
      return 'DRAFT'
    case 'H':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function mapImage(pair: CsCartImagePair, index: number): Image | undefined {
  const path = pair.detailed?.image_path
  if (!path) return undefined
  return {
    url: path,
    alt: pair.detailed?.alt ?? undefined,
    width: pair.detailed?.image_x != null ? Number(pair.detailed.image_x) : undefined,
    height: pair.detailed?.image_y != null ? Number(pair.detailed.image_y) : undefined,
    position: index,
  }
}

function tsToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!n || Number.isNaN(n)) return undefined
  return new Date(n * 1000).toISOString()
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function transformCombination(
  raw: CsCartCombination,
  productId: string,
  currency: string = 'USD',
): ProductVariant {
  return {
    id: `${productId}:${raw.combination_id}`,
    productId,
    sku: raw.product_code ?? undefined,
    price: { amount: majorToMinor(toNum(raw.price), currency), currency },
    compareAtPrice:
      raw.list_price != null && toNum(raw.list_price) > toNum(raw.price)
        ? { amount: majorToMinor(toNum(raw.list_price), currency), currency }
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(
  raw: CsCartProduct,
  currency: string = 'USD',
): Product {
  const productId = String(raw.product_id)

  const images: Image[] = []
  if (raw.main_pair) {
    const img = mapImage(raw.main_pair, 0)
    if (img) images.push(img)
  }
  if (Array.isArray(raw.images)) {
    raw.images.forEach((pair, idx) => {
      const img = mapImage(pair, idx + 1)
      if (img) images.push(img)
    })
  }

  const combinations = raw.combinations ?? []
  const variants: ProductVariant[] = combinations.map((c) =>
    transformCombination(c, productId, currency),
  )

  // Synthesize a default variant from the product itself when no
  // combinations are present (simple product).
  if (variants.length === 0) {
    variants.push({
      id: `${productId}:default`,
      productId,
      sku: raw.product_code ?? undefined,
      price: { amount: majorToMinor(toNum(raw.price), currency), currency },
      compareAtPrice:
        raw.list_price != null && toNum(raw.list_price) > toNum(raw.price)
          ? { amount: majorToMinor(toNum(raw.list_price), currency), currency }
          : undefined,
      metadata: {
        synthetic: true,
        reason: 'CS-Cart product has no combinations',
        parentProductId: productId,
      },
    })
  }

  return {
    id: productId,
    title: raw.product,
    description: raw.full_description ?? undefined,
    status: mapStatus(raw.status),
    images: images.length > 0 ? images : undefined,
    variants,
    createdAt: tsToIso(raw.timestamp),
    updatedAt: tsToIso(raw.updated_timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → CS-Cart product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    product: product.title,
    full_description: product.description,
    status:
      product.status === 'ACTIVE'
        ? 'A'
        : product.status === 'DRAFT'
          ? 'D'
          : product.status === 'ARCHIVED'
            ? 'H'
            : undefined,
  }
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['price'] = v.price.amount.toString()
    if (v.sku) body['product_code'] = v.sku
  }
  return body
}
