/**
 * Coupang seller product → canonical Product.
 *
 * Coupang's product model is structured around "seller products" with one
 * or more "items" (variants/SKUs). Each item has its own price, stock, and
 * vendor item ID. The product-level data carries the name, category, brand,
 * and images.
 *
 * Status mapping:
 *   APPROVED / SALE        → ACTIVE
 *   SUSPENDED / PROHIBITED → ARCHIVED
 *   PENDING / REVIEW       → DRAFT
 */

import type { Product, ProductStatus, ProductVariant } from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawCoupangItem {
  /** Vendor item ID (variant-level unique key). */
  vendorItemId?: number
  /** Item name (variant name, e.g. "Red / M"). */
  itemName?: string
  originalPrice?: number
  salePrice?: number
  /** Stock quantity. */
  maximumBuyCount?: number
  /** Variant attributes. */
  attributes?: Array<{ attributeTypeName: string; attributeValueName: string }>
  barcode?: string
  externalVendorSkuCode?: string
  [key: string]: unknown
}

export interface RawCoupangImage {
  imageOrder?: number
  imageType?: 'REPRESENTATION' | 'DETAIL' | string
  vendorPath?: string
  cdnPath?: string
  [key: string]: unknown
}

export interface RawCoupangProduct {
  sellerProductId?: number
  sellerProductName?: string
  /** Coupang category ID. */
  displayCategoryCode?: number
  /** Category name path, e.g. "가전/디지털>스마트폰". */
  productGroupName?: string
  brand?: string
  /** Sale / approval status. */
  statusName?: string
  /** Individual SKU items (variants). */
  items?: RawCoupangItem[]
  images?: RawCoupangImage[]
  /** Product description (HTML). */
  contents?: string
  deliveryMethod?: string
  outboundShippingTimeDay?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map Coupang statusName to canonical ProductStatus.
 */
export function mapProductStatus(statusName: string | undefined): ProductStatus | undefined {
  if (!statusName) return undefined
  const s = statusName.toUpperCase()
  if (s === 'APPROVED' || s === 'SALE' || s.includes('판매중')) return 'ACTIVE'
  if (s === 'SUSPENDED' || s === 'PROHIBITED' || s === 'REJECTED' || s.includes('금지'))
    return 'ARCHIVED'
  if (
    s === 'PENDING' ||
    s === 'REVIEW' ||
    s === 'WAIT' ||
    s === 'REGISTERING' ||
    s.includes('대기') ||
    s.includes('심사')
  )
    return 'DRAFT'
  return undefined
}

function extractImages(raw: RawCoupangProduct): Image[] | undefined {
  if (!raw.images || raw.images.length === 0) return undefined
  return raw.images
    .sort((a, b) => (a.imageOrder ?? 0) - (b.imageOrder ?? 0))
    .map((img, i) => ({
      url: img.cdnPath ?? img.vendorPath ?? '',
      position: img.imageOrder ?? i,
    }))
    .filter((img) => img.url !== '')
}

function extractVariants(raw: RawCoupangProduct): ProductVariant[] | undefined {
  if (!raw.items || raw.items.length === 0) return undefined

  return raw.items.map((item) => {
    const price = item.salePrice ?? item.originalPrice ?? 0
    const compareAt =
      item.originalPrice != null &&
      item.salePrice != null &&
      item.originalPrice > item.salePrice
        ? { amount: item.originalPrice, currency: DEFAULT_CURRENCY }
        : undefined

    const optionValues: Record<string, string> = {}
    for (const attr of item.attributes ?? []) {
      if (attr.attributeTypeName) {
        optionValues[attr.attributeTypeName] = attr.attributeValueName ?? ''
      }
    }

    return {
      id: item.vendorItemId != null ? String(item.vendorItemId) : String(raw.sellerProductId),
      productId: raw.sellerProductId != null ? String(raw.sellerProductId) : undefined,
      sku: item.externalVendorSkuCode,
      barcode: item.barcode,
      title: item.itemName ?? raw.sellerProductName,
      price: { amount: price, currency: DEFAULT_CURRENCY },
      compareAtPrice: compareAt,
      optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
      metadata: item as unknown as Record<string, unknown>,
    }
  })
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawCoupangProduct): Product {
  return {
    id: String(raw.sellerProductId ?? ''),
    title: raw.sellerProductName ?? String(raw.sellerProductId ?? ''),
    description: raw.contents,
    status: mapProductStatus(raw.statusName),
    vendor: raw.brand,
    productType: raw.displayCategoryCode != null ? String(raw.displayCategoryCode) : undefined,
    tags: undefined,
    options: undefined,
    variants: extractVariants(raw),
    images: extractImages(raw),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Coupang seller-product creation body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (product.title) body['sellerProductName'] = product.title
  if (product.description) body['contents'] = product.description
  if (product.vendor) body['brand'] = product.vendor

  const categoryId =
    (product.metadata?.['displayCategoryCode'] as number | undefined) ??
    (product.productType ? Number(product.productType) : undefined)
  if (categoryId) body['displayCategoryCode'] = categoryId

  if (product.variants && product.variants.length > 0) {
    body['items'] = product.variants.map((v) => {
      const item: Record<string, unknown> = {
        salePrice: v.price.amount,
      }
      if (v.sku) item['externalVendorSkuCode'] = v.sku
      if (v.barcode) item['barcode'] = v.barcode
      if (v.title) item['itemName'] = v.title
      if (v.optionValues) {
        item['attributes'] = Object.entries(v.optionValues).map(([name, val]) => ({
          attributeTypeName: name,
          attributeValueName: val,
        }))
      }
      return item
    })
  }

  if (product.images && product.images.length > 0) {
    body['images'] = product.images.map((img, i) => ({
      imageOrder: img.position ?? i,
      imageType: i === 0 ? 'REPRESENTATION' : 'DETAIL',
      vendorPath: img.url,
    }))
  }

  // Pass through raw extra fields if caller embedded them
  const extra = product.metadata?.['_coupangExtra'] as Record<string, unknown> | undefined
  if (extra) Object.assign(body, extra)

  return body
}
