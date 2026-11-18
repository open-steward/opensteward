/**
 * Lazada Product / SKU → canonical Product + ProductVariant.
 *
 * Lazada products contain nested SKUs which are the variants. The product
 * list endpoint (`/products/get`) returns products with embedded SKU arrays.
 * The detail endpoint (`/product/item/get`) returns a single product with
 * full SKU details.
 *
 * Money: Lazada returns prices as string values (e.g. `"19.99"`).
 * Product status: `active`, `inactive`, `deleted` → `ACTIVE`, `ARCHIVED`, `ARCHIVED`.
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawLazadaSku {
  SkuId?: number
  ShopSku?: string
  SellerSku?: string
  Url?: string
  package_height?: string
  package_width?: string
  package_length?: string
  package_weight?: string
  price?: string | number
  special_price?: string | number
  quantity?: number
  Status?: string
  Images?: string[]
  [key: string]: unknown
}

export interface RawLazadaProduct {
  item_id?: number
  primary_category?: number
  attributes?: {
    name?: string
    description?: string
    brand?: string
    short_description?: string
    [key: string]: unknown
  }
  skus?: RawLazadaSku[]
  images?: string[]
  status?: string
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Lazada product status to canonical ProductStatus.
 */
export function mapProductStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'active':
      return 'ACTIVE'
    case 'inactive':
    case 'deleted':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

/**
 * Parse a Lazada price string to a number. Returns 0 if unparseable.
 */
function parsePrice(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

function extractImages(raw: RawLazadaProduct): Image[] | undefined {
  const urls = raw.images
  if (!urls || urls.length === 0) return undefined
  return urls.map((url, i) => ({
    url,
    position: i,
  }))
}

/**
 * Transform a Lazada SKU into a canonical ProductVariant.
 */
export function transformVariant(
  sku: RawLazadaSku,
  productId: string,
  currency: string,
): ProductVariant {
  const price = parsePrice(sku.price)
  const compareAt = sku.special_price ? parsePrice(sku.special_price) : undefined

  return {
    id: String(sku.SkuId ?? sku.SellerSku ?? ''),
    productId,
    sku: sku.SellerSku ?? sku.ShopSku ?? undefined,
    title: sku.SellerSku ?? undefined,
    price: { amount: majorToMinor(price, currency), currency },
    compareAtPrice: compareAt != null ? { amount: majorToMinor(compareAt, currency), currency } : undefined,
    weight: sku.package_weight ? parseFloat(sku.package_weight) : undefined,
    weightUnit: sku.package_weight ? 'kg' : undefined,
    metadata: sku as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Lazada Product → canonical Product.
 *
 * `item_id` becomes the canonical `id`. SKUs are mapped to variants.
 */
export function transformProduct(raw: RawLazadaProduct, currency = 'USD'): Product {
  const productId = String(raw.item_id ?? '')
  const images = extractImages(raw)
  const variants = (raw.skus ?? []).map((sku) => transformVariant(sku, productId, currency))

  return {
    id: productId,
    title: raw.attributes?.name ?? productId,
    description: raw.attributes?.description ?? raw.attributes?.short_description ?? undefined,
    status: mapProductStatus(raw.status),
    vendor: raw.attributes?.brand ?? undefined,
    productType: raw.primary_category ? String(raw.primary_category) : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: raw.created_time,
    updatedAt: raw.updated_time,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Lazada product create/update XML payload body.
 *
 * Lazada's create/update endpoints accept XML-like payloads encoded as JSON.
 * This transform produces the JSON structure that maps to the Lazada API format.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const skus = (product.variants ?? []).map((v) => ({
    SellerSku: v.sku ?? v.id,
    price: v.price?.amount != null ? (v.price.amount / 100).toString() : '0',
    quantity: (v.metadata?.['quantity'] as number | undefined) ?? 0,
    package_weight: v.weight?.toString(),
  }))

  return {
    Request: {
      Product: {
        PrimaryCategory: product.productType ?? product.metadata?.['primary_category'],
        Attributes: {
          name: product.title,
          description: product.description,
          brand: product.vendor,
        },
        Skus: {
          Sku: skus.length > 0 ? skus : undefined,
        },
        Images: product.images
          ? { Image: product.images.map((img) => ({ Url: img.url })) }
          : undefined,
      },
    },
  }
}
