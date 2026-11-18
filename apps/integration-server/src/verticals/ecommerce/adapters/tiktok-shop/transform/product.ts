/**
 * TikTok Shop product → canonical Product.
 *
 * TikTok Shop's product model uses `product_id` as the primary key. Products
 * have `status` (1=draft, 2=pending, 3=failed, 4=live, 5=seller_deactivated,
 * 6=platform_deactivated, 7=freeze) and carry pricing, images, and category
 * info at the product level.
 *
 * Variants in TikTok Shop are called "skus" and are handled within the
 * product response.
 */

import type { Product, ProductStatus, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTikTokImage {
  urls?: string[]
  uri?: string
  height?: number
  width?: number
}

export interface RawTikTokSalesAttribute {
  id?: string
  name?: string
  value_id?: string
  value_name?: string
}

export interface RawTikTokSkuPrice {
  currency?: string
  original_price?: string
  sale_price?: string
  tax_exclusive_price?: string
}

export interface RawTikTokSkuInventory {
  warehouse_id?: string
  quantity?: number
}

export interface RawTikTokSku {
  id?: string
  seller_sku?: string
  price?: RawTikTokSkuPrice
  inventory?: RawTikTokSkuInventory[]
  sales_attributes?: RawTikTokSalesAttribute[]
  [key: string]: unknown
}

export interface RawTikTokProduct {
  id: string
  title?: string
  description?: string
  category_chains?: Array<{
    id?: string
    parent_id?: string
    local_name?: string
    is_leaf?: boolean
  }>
  brand?: { id?: string; name?: string }
  main_images?: RawTikTokImage[]
  skus?: RawTikTokSku[]
  status?: number
  create_time?: number
  update_time?: number
  [key: string]: unknown
}

export interface RawTikTokProductListItem {
  id: string
  title?: string
  status?: number
  create_time?: number
  update_time?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map TikTok Shop product status to canonical ProductStatus.
 *
 * 1 (draft) → DRAFT, 4 (live) → ACTIVE, all others → ARCHIVED.
 */
export function mapProductStatus(status: number | undefined): ProductStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 1:
      return 'DRAFT'
    case 4:
      return 'ACTIVE'
    case 2: // pending
    case 3: // failed
    case 5: // seller deactivated
    case 6: // platform deactivated
    case 7: // freeze
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function extractImages(raw: RawTikTokProduct): Image[] | undefined {
  const images = raw.main_images
  if (!images || images.length === 0) return undefined
  return images.map((img, i) => ({
    id: img.uri,
    url: img.urls?.[0] ?? '',
    width: img.width,
    height: img.height,
    position: i,
  }))
}

function extractVariants(raw: RawTikTokProduct): ProductVariant[] | undefined {
  const skus = raw.skus
  if (!skus || skus.length === 0) return undefined

  return skus.map((sku) => {
    const price = sku.price
    const currency = price?.currency ?? 'USD'
    const salePrice = price?.sale_price ? Number(price.sale_price) : 0
    const originalPrice = price?.original_price ? Number(price.original_price) : undefined

    const optionValues: Record<string, string> = {}
    for (const attr of sku.sales_attributes ?? []) {
      if (attr.name && attr.value_name) {
        optionValues[attr.name] = attr.value_name
      }
    }

    return {
      id: sku.id ?? '',
      productId: raw.id,
      sku: sku.seller_sku,
      title: Object.values(optionValues).join(' / ') || `SKU ${sku.id ?? raw.id}`,
      price: {
        amount: majorToMinor(salePrice, currency),
        currency,
      },
      compareAtPrice:
        originalPrice != null && originalPrice > salePrice
          ? { amount: majorToMinor(originalPrice, currency), currency }
          : undefined,
      optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
      metadata: sku as unknown as Record<string, unknown>,
    }
  })
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawTikTokProduct): Product {
  const images = extractImages(raw)
  const variants = extractVariants(raw)

  // Get category name from the deepest leaf
  const categories = raw.category_chains ?? []
  const leafCategory = categories.find((c) => c.is_leaf) ?? categories[categories.length - 1]

  return {
    id: raw.id,
    title: raw.title ?? raw.id,
    description: raw.description,
    status: mapProductStatus(raw.status),
    vendor: raw.brand?.name,
    productType: leafCategory?.local_name ?? leafCategory?.id,
    tags: undefined,
    options: undefined,
    variants,
    images,
    createdAt: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : undefined,
    updatedAt: raw.update_time ? new Date(raw.update_time * 1000).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → TikTok Shop create/update product body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title) body['title'] = product.title
  if (product.description) body['description'] = product.description

  // Category from productType or metadata
  const categoryId =
    (product.metadata?.['category_id'] as string | undefined) ??
    product.productType
  if (categoryId) body['category_id'] = categoryId

  // SKUs from variants
  if (product.variants && product.variants.length > 0) {
    body['skus'] = product.variants.map((v) => {
      const sku: Record<string, unknown> = {}
      if (v.sku) sku['seller_sku'] = v.sku
      if (v.price) {
        sku['price'] = {
          amount: String(v.price.amount),
          currency: v.price.currency,
        }
      }
      if (v.optionValues) {
        sku['sales_attributes'] = Object.entries(v.optionValues).map(([name, value]) => ({
          name,
          value_name: value,
        }))
      }
      return sku
    })
  }

  // Images
  if (product.images && product.images.length > 0) {
    body['main_images'] = product.images.map((img) => ({
      uri: img.id,
      urls: [img.url],
    }))
  }

  // Pass through any extra fields from metadata
  const extra = product.metadata?.['_tiktokExtra'] as Record<string, unknown> | undefined
  if (extra) {
    Object.assign(body, extra)
  }

  return body
}
