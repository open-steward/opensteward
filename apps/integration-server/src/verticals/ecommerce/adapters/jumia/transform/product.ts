/**
 * Jumia Product / SKU → canonical Product + ProductVariant.
 *
 * Jumia products contain nested "variations" (SKUs) which are the variants.
 * The product list endpoint returns products with embedded variation arrays.
 *
 * Money: Jumia returns prices as numeric values.
 * Product status: `active`, `inactive`, `deleted` → `ACTIVE`, `ARCHIVED`, `ARCHIVED`.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJumiaVariation {
  sku_id?: string | number
  seller_sku?: string
  name?: string
  price?: number | string
  sale_price?: number | string
  quantity?: number
  status?: string
  images?: string[]
  weight?: number | string
  package_weight?: number | string
  color_family?: string
  size?: string
  [key: string]: unknown
}

export interface RawJumiaProduct {
  product_id?: string | number
  name?: string
  description?: string
  short_description?: string
  brand?: string
  category_id?: number | string
  primary_category?: string
  status?: string
  images?: string[]
  variations?: RawJumiaVariation[]
  created_at?: string
  updated_at?: string
  url?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Jumia product status to canonical ProductStatus.
 */
export function mapProductStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'active':
    case 'live':
      return 'ACTIVE'
    case 'inactive':
    case 'deleted':
    case 'suspended':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

/**
 * Parse a Jumia price value to a number. Returns 0 if unparseable.
 */
function parsePrice(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

function extractImages(raw: RawJumiaProduct): Image[] | undefined {
  const urls = raw.images
  if (!urls || urls.length === 0) return undefined
  return urls.map((url, i) => ({
    url,
    position: i,
  }))
}

/**
 * Transform a Jumia variation into a canonical ProductVariant.
 */
export function transformVariant(
  variation: RawJumiaVariation,
  productId: string,
  currency: string,
): ProductVariant {
  const price = parsePrice(variation.price)
  const compareAt = variation.sale_price ? parsePrice(variation.sale_price) : undefined

  const optionValues: Record<string, string> = {}
  if (variation.color_family) optionValues['color'] = variation.color_family
  if (variation.size) optionValues['size'] = variation.size

  return {
    id: String(variation.sku_id ?? variation.seller_sku ?? ''),
    productId,
    sku: variation.seller_sku ?? undefined,
    title: variation.name ?? variation.seller_sku ?? undefined,
    price: { amount: price, currency },
    compareAtPrice: compareAt != null ? { amount: compareAt, currency } : undefined,
    weight: variation.package_weight
      ? parseFloat(String(variation.package_weight))
      : variation.weight
        ? parseFloat(String(variation.weight))
        : undefined,
    weightUnit: variation.package_weight || variation.weight ? 'kg' : undefined,
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: variation as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Jumia Product → canonical Product.
 *
 * `product_id` becomes the canonical `id`. Variations are mapped to variants.
 */
export function transformProduct(raw: RawJumiaProduct, currency = 'NGN'): Product {
  const productId = String(raw.product_id ?? '')
  const images = extractImages(raw)
  const variants = (raw.variations ?? []).map((v) => transformVariant(v, productId, currency))

  return {
    id: productId,
    title: raw.name ?? productId,
    description: raw.description ?? raw.short_description ?? undefined,
    status: mapProductStatus(raw.status),
    vendor: raw.brand ?? undefined,
    productType: raw.primary_category ?? (raw.category_id ? String(raw.category_id) : undefined),
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Jumia product create/update request body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const variations = (product.variants ?? []).map((v) => ({
    seller_sku: v.sku ?? v.id,
    price: v.price?.amount ?? 0,
    quantity: (v.metadata?.['quantity'] as number | undefined) ?? 0,
    package_weight: v.weight?.toString(),
  }))

  return {
    product: {
      name: product.title,
      description: product.description,
      brand: product.vendor,
      category_id: product.productType ?? product.metadata?.['category_id'],
      variations: variations.length > 0 ? variations : undefined,
      images: product.images?.map((img) => img.url),
    },
  }
}
