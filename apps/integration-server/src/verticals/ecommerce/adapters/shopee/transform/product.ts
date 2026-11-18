/**
 * Shopee item → canonical Product.
 *
 * Shopee's product model uses `item_id` as the primary key. Items have
 * `item_status` (NORMAL, BANNED, DELETED, UNLIST) and carry pricing,
 * images, and category info at the item level.
 *
 * Variants in Shopee are called "models" (tier variations) and are
 * handled separately in the variant transform.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeImage {
  image_url_list?: string[]
  image_id_list?: string[]
}

export interface RawShopeePriceInfo {
  currency?: string
  original_price?: number
  current_price?: number
  inflated_price_of_original_price?: number
  inflated_price_of_current_price?: number
  sip_item_price?: number
  sip_item_price_source?: string
}

export interface RawShopeeItemListItem {
  item_id: number
  item_status: string
  update_time?: number
}

export interface RawShopeeItem {
  item_id: number
  category_id?: number
  item_name?: string
  item_sku?: string
  description?: string
  item_status?: string
  brand?: { brand_id?: number; original_brand_name?: string }
  price_info?: RawShopeePriceInfo[]
  image?: RawShopeeImage
  weight?: number
  dimension?: { package_length?: number; package_width?: number; package_height?: number }
  condition?: string
  item_dangerous?: number
  create_time?: number
  update_time?: number
  stock_info_v2?: { summary_info?: { total_reserved_stock?: number; total_available_stock?: number } }
  has_model?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Shopee item_status to canonical ProductStatus.
 *
 * NORMAL → ACTIVE, BANNED / DELETED → ARCHIVED, UNLIST → DRAFT.
 */
export function mapProductStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'NORMAL':
      return 'ACTIVE'
    case 'BANNED':
    case 'DELETED':
      return 'ARCHIVED'
    case 'UNLIST':
      return 'DRAFT'
    default:
      return undefined
  }
}

function extractImages(raw: RawShopeeItem): Image[] | undefined {
  const urls = raw.image?.image_url_list
  const ids = raw.image?.image_id_list
  if (!urls || urls.length === 0) return undefined
  return urls.map((url, i) => ({
    id: ids?.[i],
    url,
    position: i,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawShopeeItem): Product {
  const images = extractImages(raw)
  const priceInfo = raw.price_info?.[0]
  const currency = priceInfo?.currency ?? 'USD'

  return {
    id: String(raw.item_id),
    title: raw.item_name ?? String(raw.item_id),
    description: raw.description,
    status: mapProductStatus(raw.item_status),
    vendor: raw.brand?.original_brand_name,
    productType: raw.category_id != null ? String(raw.category_id) : undefined,
    tags: undefined,
    options: undefined,
    variants: priceInfo
      ? [
          {
            id: String(raw.item_id),
            productId: String(raw.item_id),
            sku: raw.item_sku,
            title: raw.item_name ?? String(raw.item_id),
            price: {
              amount: majorToMinor(
                priceInfo.current_price ?? priceInfo.original_price ?? 0,
                currency,
              ),
              currency,
            },
            compareAtPrice:
              priceInfo.original_price != null &&
              priceInfo.current_price != null &&
              priceInfo.original_price > priceInfo.current_price
                ? { amount: majorToMinor(priceInfo.original_price, currency), currency }
                : undefined,
            weight: raw.weight,
            weightUnit: 'kg' as const,
            metadata: priceInfo as unknown as Record<string, unknown>,
          },
        ]
      : undefined,
    images,
    createdAt: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : undefined,
    updatedAt: raw.update_time ? new Date(raw.update_time * 1000).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Shopee add_item / update_item body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title) body['item_name'] = product.title
  if (product.description) body['description'] = product.description

  // Category is required for add_item
  const categoryId =
    (product.metadata?.['category_id'] as number | undefined) ??
    (product.productType ? Number(product.productType) : undefined)
  if (categoryId) body['category_id'] = categoryId

  // Price from the first variant
  const variant = product.variants?.[0]
  if (variant?.price) {
    body['original_price'] = variant.price.amount
  }

  // Images
  if (product.images && product.images.length > 0) {
    body['image'] = {
      image_id_list: product.images
        .filter((img) => img.id)
        .map((img) => img.id),
    }
  }

  // Weight
  if (variant?.weight != null) {
    body['weight'] = variant.weight
  }

  // Pass through any extra fields from metadata
  const extra = product.metadata?.['_shopeeExtra'] as Record<string, unknown> | undefined
  if (extra) {
    Object.assign(body, extra)
  }

  return body
}
