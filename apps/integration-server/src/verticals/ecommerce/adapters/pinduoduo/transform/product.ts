/**
 * Pinduoduo goods → canonical Product + ProductVariant.
 *
 * PDD uses "goods" (商品) as the product entity. Each goods item has one or
 * more SKUs (`sku_list`) representing purchasable variants. The `goods_id` is
 * the canonical product id; each SKU's `sku_id` is the variant id.
 *
 * Prices in PDD are integers in fen (Chinese cents): 1 CNY = 100 fen.
 * All prices are converted to CNY decimal on output.
 *
 * Status mapping (is_onsale / goods_status):
 *   is_onsale = 1                    → ACTIVE
 *   is_onsale = 0, goods_status = 0  → DRAFT
 *   goods_status = -1                → ARCHIVED (deleted)
 */

import type { Product, ProductStatus, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import {
  GOODS_STATUS_DELETED,
} from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawPddSku {
  /** SKU identifier. */
  sku_id?: string | number
  /** Seller-defined SKU code (outer SKU ID). */
  outer_id?: string
  /** SKU-level price in fen (Chinese cents). */
  sku_price?: number
  /** SKU-level stock quantity. */
  sku_quantity?: number
  /** SKU specification string (e.g. "颜色:红色;尺寸:M"). */
  spec?: string
  /** Whether this SKU is on sale. */
  is_onsale?: number
  /** Thumbnail image URL for this SKU. */
  thumb_url?: string
  [key: string]: unknown
}

export interface RawPddGoods {
  /** Pinduoduo goods ID. */
  goods_id?: string | number
  /** Goods name (product title). */
  goods_name?: string
  /** Short goods description. */
  goods_desc?: string
  /** Main gallery image URLs. */
  image_url?: string[]
  /** Thumbnail image URL. */
  thumb_url?: string
  /** Whether goods are currently on sale (1 = on sale, 0 = off-shelf). */
  is_onsale?: number
  /**
   * Goods status:
   *   1  = listed/on sale
   *   0  = unlisted/draft
   *  -1  = deleted/archived
   */
  goods_status?: number
  /** Goods category name. */
  goods_type?: string
  /** List of SKUs belonging to this goods item. */
  sku_list?: RawPddSku[]
  /** Goods creation timestamp (Unix seconds). */
  create_time?: number
  /** Goods last-modified timestamp (Unix seconds). */
  update_time?: number
  /** Goods detail page URL. */
  goods_url?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pinduoduo reports every amount in fen, which IS the minor unit of CNY — the
 * same unit canonical `Money.amount` requires. So this is deliberately an
 * identity on the value: there is nothing to convert.
 *
 * It replaces a `fenToYuan` helper that divided by 100. That was not merely
 * redundant, it was backwards: it turned a correct minor-unit integer into a
 * major-unit decimal, which the canonical schema rejects as non-integer and
 * which understated every amount by a factor of 100. Whole-hundred fixtures
 * kept parsing, so nothing failed.
 *
 * Kept as a named function rather than inlined so the unit is asserted at each
 * call site instead of being assumed.
 */
export function fenAsMinorUnits(fen: number | undefined): number {
  if (fen == null || Number.isNaN(fen)) return 0
  return fen
}

/**
 * Convert a Unix timestamp (seconds) to an ISO 8601 string.
 * Returns undefined for null/zero/invalid input.
 */
export function unixToIso(ts: number | undefined): string | undefined {
  if (!ts) return undefined
  return new Date(ts * 1000).toISOString()
}

/**
 * Map PDD goods on-sale and status fields to canonical ProductStatus.
 */
export function mapGoodsStatus(
  isOnsale: number | undefined,
  goodsStatus: number | undefined,
): ProductStatus | undefined {
  // Explicitly deleted / archived
  if (goodsStatus === GOODS_STATUS_DELETED) return 'ARCHIVED'
  // Currently listed for sale
  if (isOnsale === 1) return 'ACTIVE'
  // Off-shelf but not deleted → draft
  if (isOnsale === 0) return 'DRAFT'
  return undefined
}

function buildImages(raw: RawPddGoods): Image[] | undefined {
  const images: Image[] = []

  // Gallery images
  if (Array.isArray(raw.image_url)) {
    raw.image_url.forEach((url, i) => {
      if (url) images.push({ url, position: i })
    })
  }

  // Thumbnail fallback if no gallery images
  if (images.length === 0 && raw.thumb_url) {
    images.push({ url: raw.thumb_url, position: 0 })
  }

  return images.length > 0 ? images : undefined
}

/**
 * Map a PDD SKU to a canonical ProductVariant.
 */
export function transformVariant(
  sku: RawPddSku,
  productId: string,
  currency: string,
): ProductVariant {
  return {
    id: String(sku.sku_id ?? ''),
    productId,
    sku: sku.outer_id ?? undefined,
    title: sku.spec ?? undefined,
    price: { amount: fenAsMinorUnits(sku.sku_price), currency },
    metadata: sku as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * PDD goods → canonical Product.
 *
 * `goods_id` becomes the canonical `id`. SKU list becomes variants.
 * The complete raw goods object is stored in `metadata`.
 */
export function transformProduct(raw: RawPddGoods, currency = 'CNY'): Product {
  const productId = String(raw.goods_id ?? '')
  const skus = raw.sku_list ?? []
  const variants = skus.map((sku) => transformVariant(sku, productId, currency))
  const images = buildImages(raw)

  return {
    id: productId,
    title: raw.goods_name ?? productId,
    description: raw.goods_desc ?? undefined,
    status: mapGoodsStatus(raw.is_onsale, raw.goods_status),
    productType: raw.goods_type ?? undefined,
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: unixToIso(raw.create_time),
    updatedAt: unixToIso(raw.update_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → PDD goods update payload.
 *
 * Maps writable fields back to their PDD equivalents for use with
 * `pdd.goods.commit.update`. Only a subset of fields can be changed;
 * unsupported fields are silently ignored.
 */
export function untransformProduct(
  product: Partial<Product>,
): Record<string, string | number | undefined> {
  return {
    goods_id: product.id ? Number(product.id) : undefined,
    goods_name: product.title,
    goods_desc: product.description ?? undefined,
    is_onsale:
      product.status === 'ACTIVE'
        ? 1
        : product.status === 'DRAFT' || product.status === 'ARCHIVED'
          ? 0
          : undefined,
  }
}
