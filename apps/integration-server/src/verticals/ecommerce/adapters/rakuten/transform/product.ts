/**
 * Rakuten RMS item → canonical Product.
 *
 * Rakuten Ichiba items are identified by a seller-defined `itemUrl` (a URL
 * path segment unique to the shop). The RMS API returns item data as JSON
 * when the `Accept: application/json` header is sent.
 *
 * Key Rakuten concepts:
 *   - `itemUrl`      — unique item identifier (slug), used as the item id
 *   - `itemName`     — product title
 *   - `itemPrice`    — price in JPY (integer)
 *   - `genreId`      — Rakuten category id
 *   - `itemCaption`  — HTML product description
 *   - `itemStatus`   — 0 = on sale, 1 = sold out, 2 = not displayed
 *   - `catalogId`    — optional catalog (JAN code)
 *   - `images`       — array of image objects with `url`
 *
 * Variants: Rakuten's "options" are called `selectType` items, represented
 * as flat attributes. We model them as a single default variant.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RakutenItemImage {
  url?: string
  /** Item number within the image sequence (1-based) */
  imageNo?: number
  [key: string]: unknown
}

export interface RakutenItemInventory {
  remainingCount?: number
  normalInventoryStock?: number
  [key: string]: unknown
}

export interface RakutenItem {
  /** Unique item identifier (URL slug) */
  itemUrl: string
  itemName?: string
  /** Price in JPY (integer) */
  itemPrice?: number
  /** HTML item description */
  itemCaption?: string
  /**
   * Item status:
   *   0 = on sale (ACTIVE)
   *   1 = sold out (DRAFT)
   *   2 = not displayed (ARCHIVED)
   */
  itemStatus?: number
  /** Rakuten genre (category) id */
  genreId?: string | number
  /** JAN / catalog code */
  catalogId?: string
  /** Seller's shop code */
  shopCode?: string
  /** Item management number (internal SKU) */
  manageNumber?: string
  /** Tags / search keywords */
  catchCopy?: string
  /** Shipping group */
  deliveryGroupId?: number
  /** Stock / inventory info */
  inventory?: RakutenItemInventory
  /** Array of item images */
  images?: RakutenItemImage[]
  /** Unix timestamp (seconds) — creation */
  registrationDatetime?: string
  /** Unix timestamp (seconds) — last update */
  updateDatetime?: string
  /** Tax rate (e.g. 10 = 10%) */
  taxRate?: number
  /** Item weight in grams */
  itemWeight?: number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map Rakuten itemStatus to canonical ProductStatus.
 *   0 = on sale   → ACTIVE
 *   1 = sold out  → DRAFT
 *   2 = hidden    → ARCHIVED
 */
export function mapProductStatus(status: number | undefined): ProductStatus | undefined {
  if (status === undefined || status === null) return undefined
  switch (status) {
    case 0:
      return 'ACTIVE'
    case 1:
      return 'DRAFT'
    case 2:
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function extractImages(raw: RakutenItem): Image[] | undefined {
  if (!raw.images || raw.images.length === 0) return undefined
  return raw.images
    .filter((img) => img.url)
    .map((img, i) => ({
      url: img.url!,
      position: img.imageNo != null ? img.imageNo - 1 : i,
    }))
}

function buildHandle(itemUrl: string): string {
  // itemUrl may look like "shop-name/item-slug" — use the last segment
  const parts = itemUrl.split('/')
  return parts[parts.length - 1] ?? itemUrl
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformProduct(raw: RakutenItem): Product {
  const currency = DEFAULT_CURRENCY
  const price = raw.itemPrice ?? 0
  const images = extractImages(raw)

  const tags: string[] = []
  if (raw.catchCopy) tags.push(raw.catchCopy)

  return {
    id: raw.itemUrl,
    title: raw.itemName ?? raw.itemUrl,
    description: raw.itemCaption,
    handle: buildHandle(raw.itemUrl),
    status: mapProductStatus(raw.itemStatus),
    vendor: raw.shopCode,
    productType: raw.genreId != null ? String(raw.genreId) : undefined,
    tags: tags.length > 0 ? tags : undefined,
    variants: [
      {
        id: raw.itemUrl,
        productId: raw.itemUrl,
        sku: raw.manageNumber ?? raw.catalogId,
        title: raw.itemName ?? raw.itemUrl,
        price: { amount: price, currency },
        weight: raw.itemWeight,
        weightUnit: 'g',
        metadata: {
          itemUrl: raw.itemUrl,
          itemPrice: raw.itemPrice,
          manageNumber: raw.manageNumber,
        },
      },
    ],
    images,
    createdAt: raw.registrationDatetime ?? undefined,
    updatedAt: raw.updateDatetime ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Rakuten RMS create/update item body.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (product.title) body['itemName'] = product.title
  if (product.description) body['itemCaption'] = product.description

  const variant = product.variants?.[0]
  if (variant?.price) {
    body['itemPrice'] = Math.round(variant.price.amount)
  }
  if (variant?.sku) body['manageNumber'] = variant.sku

  if (product.productType) body['genreId'] = product.productType
  if (product.tags && product.tags.length > 0) body['catchCopy'] = product.tags[0]

  if (product.status !== undefined) {
    // ACTIVE → 0, DRAFT → 1, ARCHIVED → 2
    const statusMap: Record<string, number> = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 }
    const mapped = product.status ? statusMap[product.status] : undefined
    if (mapped !== undefined) body['itemStatus'] = mapped
  }

  // Images
  if (product.images && product.images.length > 0) {
    body['images'] = product.images
      .filter((img) => img.url)
      .map((img, i) => ({ url: img.url, imageNo: i + 1 }))
  }

  return body
}
