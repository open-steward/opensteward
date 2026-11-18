/**
 * JD.com SKU → canonical Product.
 *
 * JD's product model centres around "ware" (commodity) and "SKU". A ware
 * has one or more SKUs. The SKU API (`jingdong.sku.read`) returns detailed
 * product info including pricing, images, and attributes.
 *
 * Data localization: JD product data is primarily in Simplified Chinese.
 * All fields are preserved as-is in metadata. Prices are in CNY.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdImage {
  path?: string
  is_primary?: number
  order_sort?: number
  position?: number
  [key: string]: unknown
}

export interface RawJdSkuListItem {
  sku_id: number
  ware_id?: number
  status?: number
  title?: string
  modified?: string
  [key: string]: unknown
}

export interface RawJdSku {
  sku_id: number
  ware_id?: number
  title?: string
  upc_code?: string
  item_num?: string
  outer_id?: string
  jd_price?: number
  market_price?: number
  cost_price?: number
  status?: number
  weight?: number
  length?: number
  width?: number
  height?: number
  category_id?: number
  brand_id?: number
  brand_name?: string
  stock_num?: number
  images?: RawJdImage[]
  attributes?: Array<{
    attr_id?: number
    attr_name?: string
    attr_value?: string
    [key: string]: unknown
  }>
  sale_attrs?: Array<{
    attr_id?: number
    attr_name?: string
    attr_values?: Array<{
      attr_value_id?: number
      attr_value_name?: string
    }>
    [key: string]: unknown
  }>
  created?: string
  modified?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map JD SKU status to canonical ProductStatus.
 *
 * JD status codes: 1 = on sale, 2 = delisted, 4 = deleted
 */
export function mapProductStatus(status: number | undefined): ProductStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 1:
      return 'ACTIVE'
    case 2:
      return 'DRAFT'
    case 4:
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function extractImages(raw: RawJdSku): Image[] | undefined {
  if (!raw.images || raw.images.length === 0) return undefined
  return raw.images.map((img, i) => ({
    id: undefined,
    url: img.path ?? '',
    position: img.order_sort ?? img.position ?? i,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawJdSku): Product {
  const images = extractImages(raw)
  const currency = 'CNY'

  return {
    id: String(raw.sku_id),
    title: raw.title ?? String(raw.sku_id),
    description: undefined, // JD description requires a separate API call
    status: mapProductStatus(raw.status),
    vendor: raw.brand_name,
    productType: raw.category_id != null ? String(raw.category_id) : undefined,
    tags: undefined,
    options: raw.sale_attrs && raw.sale_attrs.length > 0
      ? raw.sale_attrs.map((attr, i) => ({
          id: attr.attr_id != null ? String(attr.attr_id) : undefined,
          name: attr.attr_name ?? `Option ${i + 1}`,
          values: (attr.attr_values ?? []).map((v) => v.attr_value_name ?? ''),
          position: i,
        }))
      : undefined,
    variants: [
      {
        id: String(raw.sku_id),
        productId: raw.ware_id != null ? String(raw.ware_id) : String(raw.sku_id),
        sku: raw.outer_id ?? raw.item_num,
        barcode: raw.upc_code,
        title: raw.title ?? String(raw.sku_id),
        price: {
          amount: raw.jd_price ?? 0,
          currency,
        },
        compareAtPrice:
          raw.market_price != null &&
          raw.jd_price != null &&
          raw.market_price > raw.jd_price
            ? { amount: raw.market_price, currency }
            : undefined,
        weight: raw.weight,
        weightUnit: 'kg' as const,
        metadata: {} as Record<string, unknown>,
      },
    ],
    images,
    createdAt: raw.created ? new Date(raw.created).toISOString() : undefined,
    updatedAt: raw.modified ? new Date(raw.modified).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → JD.com SKU create/update body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title) body['title'] = product.title
  if (product.description) body['introduction'] = product.description

  const categoryId =
    (product.metadata?.['category_id'] as number | undefined) ??
    (product.productType ? Number(product.productType) : undefined)
  if (categoryId) body['category_id'] = categoryId

  const variant = product.variants?.[0]
  if (variant?.price) {
    body['jd_price'] = variant.price.amount
  }
  if (variant?.sku) {
    body['outer_id'] = variant.sku
  }
  if (variant?.barcode) {
    body['upc_code'] = variant.barcode
  }
  if (variant?.weight != null) {
    body['weight'] = variant.weight
  }

  // Pass through extra fields
  const extra = product.metadata?.['_jdExtra'] as Record<string, unknown> | undefined
  if (extra) {
    Object.assign(body, extra)
  }

  return body
}
