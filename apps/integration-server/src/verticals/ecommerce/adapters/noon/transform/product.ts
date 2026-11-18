/**
 * Noon Product -> canonical Product + ProductVariant.
 *
 * Noon products have a parent product with child SKUs (variants). The Seller
 * API returns products with nested `skus` arrays containing pricing, stock,
 * and attribute data.
 *
 * Product status: `live`, `pending`, `suspended`, `deleted`
 *   -> `ACTIVE`, `DRAFT`, `ARCHIVED`, `ARCHIVED`
 *
 * Arabic locale support: product `title_ar` and `description_ar` are preserved
 * in metadata. The canonical `title` uses the English name by default, falling
 * back to Arabic when no English name is available.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// -- Raw shapes ---------------------------------------------------------------

export interface RawNoonSku {
  sku?: string
  seller_sku?: string
  barcode?: string
  title?: string
  title_ar?: string
  price?: number | string
  sale_price?: number | string
  stock?: number
  weight?: number | string
  weight_unit?: string
  status?: string
  images?: string[]
  options?: Record<string, string>
  [key: string]: unknown
}

export interface RawNoonProduct {
  product_id?: string | number
  title?: string
  title_ar?: string
  description?: string
  description_ar?: string
  brand?: string
  category_id?: string | number
  category_name?: string
  skus?: RawNoonSku[]
  images?: string[]
  status?: string
  tags?: string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// -- Helpers ------------------------------------------------------------------

/**
 * Map Noon product status to canonical ProductStatus.
 */
export function mapProductStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'live':
    case 'active':
      return 'ACTIVE'
    case 'pending':
    case 'draft':
      return 'DRAFT'
    case 'suspended':
    case 'deleted':
    case 'inactive':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

/**
 * Parse a price value to a number. Returns 0 if unparseable.
 */
function parsePrice(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

function extractImages(raw: RawNoonProduct): Image[] | undefined {
  const urls = raw.images
  if (!urls || urls.length === 0) return undefined
  return urls.map((url, i) => ({
    url,
    position: i,
  }))
}

/**
 * Transform a Noon SKU into a canonical ProductVariant.
 */
export function transformVariant(
  sku: RawNoonSku,
  productId: string,
  currency: string,
): ProductVariant {
  const price = parsePrice(sku.price)
  const salePrice = sku.sale_price ? parsePrice(sku.sale_price) : undefined

  return {
    id: sku.sku ?? sku.seller_sku ?? '',
    productId,
    sku: sku.seller_sku ?? sku.sku ?? undefined,
    barcode: sku.barcode ?? undefined,
    title: sku.title ?? sku.title_ar ?? undefined,
    price: { amount: price, currency },
    compareAtPrice: salePrice != null ? { amount: salePrice, currency } : undefined,
    weight: sku.weight ? parseFloat(String(sku.weight)) : undefined,
    weightUnit: sku.weight_unit === 'g' ? 'g' : sku.weight ? 'kg' : undefined,
    optionValues: sku.options ?? undefined,
    metadata: sku as unknown as Record<string, unknown>,
  }
}

// -- Transform ----------------------------------------------------------------

/**
 * Noon Product -> canonical Product.
 *
 * `product_id` becomes the canonical `id`. SKUs are mapped to variants.
 * Arabic fields (title_ar, description_ar) are preserved in metadata.
 */
export function transformProduct(raw: RawNoonProduct, currency = 'AED'): Product {
  const productId = String(raw.product_id ?? '')
  const images = extractImages(raw)
  const variants = (raw.skus ?? []).map((sku) => transformVariant(sku, productId, currency))

  return {
    id: productId,
    title: raw.title ?? raw.title_ar ?? productId,
    description: raw.description ?? raw.description_ar ?? undefined,
    status: mapProductStatus(raw.status),
    vendor: raw.brand ?? undefined,
    productType: raw.category_name ?? (raw.category_id ? String(raw.category_id) : undefined),
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product -> Noon product create/update payload.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const skus = (product.variants ?? []).map((v) => ({
    seller_sku: v.sku ?? v.id,
    barcode: v.barcode,
    price: v.price?.amount ?? 0,
    stock: (v.metadata?.['stock'] as number | undefined) ?? 0,
    weight: v.weight,
    options: v.optionValues,
  }))

  return {
    title: product.title,
    title_ar: (product.metadata?.['title_ar'] as string | undefined),
    description: product.description,
    description_ar: (product.metadata?.['description_ar'] as string | undefined),
    brand: product.vendor,
    category_id: product.productType ?? product.metadata?.['category_id'],
    tags: product.tags,
    skus: skus.length > 0 ? skus : undefined,
    images: product.images ? product.images.map((img) => img.url) : undefined,
  }
}
