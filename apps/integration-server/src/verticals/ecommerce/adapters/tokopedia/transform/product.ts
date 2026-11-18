/**
 * Tokopedia product → canonical Product.
 *
 * Tokopedia's product model uses `basic.productID` as the primary key.
 * Products have a status field, price info, images, and category info.
 * Variants in Tokopedia are modelled as child products or "variant"
 * sub-objects within the product response.
 *
 * Docs: https://developer.tokopedia.com/openapi/guide/#/product
 */

import type { Product, ProductStatus } from '../../../schema/product'
import { toIsoDatetime, toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTokopediaImage {
  picID?: number
  fileName?: string
  filePath?: string
  status?: number
  OriginalURL?: string
  ThumbnailURL?: string
  width?: number
  height?: number
}

export interface RawTokopediaPriceInfo {
  value?: number
  currency?: string
  LastUpdateUnix?: number
  idr?: number
}

export interface RawTokopediaWeight {
  value?: number
  unit?: string
}

export interface RawTokopediaProduct {
  basic?: {
    productID?: number
    shopID?: number
    status?: number
    Name?: string
    condition?: number
    childCategoryID?: number
    shortDesc?: string
  }
  price?: RawTokopediaPriceInfo
  weight?: RawTokopediaWeight
  pictures?: RawTokopediaImage[]
  GMStats?: {
    transactionSuccess?: number
    transactionReject?: number
    countSold?: number
  }
  stats?: {
    countView?: number
  }
  other?: {
    sku?: string
    url?: string
    mobileURL?: string
  }
  stock?: {
    value?: number
    stockWording?: string
  }
  variant?: {
    isParent?: boolean
    isVariant?: boolean
    childrenID?: number[]
  }
  campaign?: {
    discountedPrice?: number
    originalPrice?: number
    discountPercentage?: number
  }
  createTime?: string
  updateTime?: string
  [key: string]: unknown
}

export interface RawTokopediaProductListItem {
  productID?: number
  status?: number
  Name?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Tokopedia product status to canonical ProductStatus.
 *
 * Tokopedia uses numeric status codes:
 *   1 = active (live), 2 = inactive/not live, 3 = deleted/warehouse,
 *   0 = pending/banned.
 */
export function mapProductStatus(status: number | undefined): ProductStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 1:
      return 'ACTIVE'
    case 2:
      return 'DRAFT'
    case 3:
    case -1:
    case -2:
      return 'ARCHIVED'
    case 0:
      return 'DRAFT'
    default:
      return undefined
  }
}

function extractImages(pictures: RawTokopediaImage[] | undefined): Image[] | undefined {
  if (!pictures || pictures.length === 0) return undefined
  return pictures.map((pic, i) => ({
    id: pic.picID != null ? String(pic.picID) : undefined,
    url: pic.OriginalURL ?? pic.filePath ?? '',
    width: pic.width,
    height: pic.height,
    position: i,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawTokopediaProduct): Product {
  const images = extractImages(raw.pictures)
  const priceValue = raw.campaign?.discountedPrice ?? raw.price?.value ?? 0
  const currency = raw.price?.currency ?? 'IDR'
  const productId = String(raw.basic?.productID ?? 0)

  return {
    id: productId,
    title: raw.basic?.Name ?? productId,
    description: raw.basic?.shortDesc,
    handle: toSlug(raw.other?.url),
    status: mapProductStatus(raw.basic?.status),
    productType: raw.basic?.childCategoryID != null
      ? String(raw.basic.childCategoryID)
      : undefined,
    tags: undefined,
    options: undefined,
    variants: [
      {
        id: productId,
        productId,
        sku: raw.other?.sku,
        title: raw.basic?.Name ?? productId,
        price: {
          amount: priceValue,
          currency,
        },
        compareAtPrice:
          raw.campaign?.originalPrice != null &&
          raw.campaign.discountedPrice != null &&
          raw.campaign.originalPrice > raw.campaign.discountedPrice
            ? { amount: raw.campaign.originalPrice, currency }
            : undefined,
        weight: raw.weight?.value,
        weightUnit: raw.weight?.unit === 'GR' ? 'g' : 'kg',
        metadata: (raw.price ?? {}) as unknown as Record<string, unknown>,
      },
    ],
    images,
    createdAt: toIsoDatetime(raw.createTime),
    updatedAt: toIsoDatetime(raw.updateTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Tokopedia create/edit product body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title) body['Name'] = product.title
  if (product.description) body['short_desc'] = product.description

  // Category
  const categoryId =
    (product.metadata?.['childCategoryID'] as number | undefined) ??
    (product.productType ? Number(product.productType) : undefined)
  if (categoryId) body['category_id'] = categoryId

  // Price from the first variant
  const variant = product.variants?.[0]
  if (variant?.price) {
    body['price'] = variant.price.amount
    body['price_currency'] = variant.price.currency ?? 'IDR'
  }

  // Weight
  if (variant?.weight != null) {
    body['weight'] = variant.weight
    body['weight_unit'] = variant.weightUnit === 'g' ? 'GR' : 'KG'
  }

  // SKU
  if (variant?.sku) {
    body['sku'] = variant.sku
  }

  // Images
  if (product.images && product.images.length > 0) {
    body['pictures'] = product.images.map((img) => ({
      file_path: img.url,
    }))
  }

  // Stock
  const stock = product.metadata?.['_tokopediaStock'] as number | undefined
  if (stock != null) body['stock'] = stock

  // Pass through extra fields
  const extra = product.metadata?.['_tokopediaExtra'] as Record<string, unknown> | undefined
  if (extra) Object.assign(body, extra)

  return body
}
