/**
 * Temu goods → canonical Product.
 *
 * Two documented shapes, both camelCase (fetched 2026-09-25 from
 * POST https://partner-us.temu.com/riemann/api/v2/api/doc/detail/get):
 *
 *   - a row of `result.goodsList` from `bg.local.goods.list.query`
 *     ("goodsId [LONG] :: The unique identifier for the product",
 *     "goodsName [STRING] :: The title or name of the product",
 *     "thumbUrl [STRING] :: The URL for the product's thumbnail image",
 *     "status4VO [INTEGER] :: The status of the product (e.g., 1 for on sale,
 *     4 for unpublished, etc.)",
 *     "crtTime [LONG] :: The creation time of the product, in seconds (Unix
 *     timestamp)");
 *   - `result` of `bg.local.goods.detail.query` ("goodsId [LONG] :: Product
 *     ID", "goodsName [STRING] :: Product Name", "goodsDesc [STRING] :: Goods
 *     Desc").
 *
 * Variants are not mapped. Every documented Temu price is
 * `{ amount [STRING] :: Amount, currency [STRING] :: Currency Type }` with no
 * unit or scale named anywhere in the docs, and the canonical variant's
 * `price` is required, so there is nothing honest to put in it. The SKUs stay
 * in `metadata` (`skuInfoList` / `skuList`).
 */

import type { Product, ProductStatus } from '../../../schema/product'
import { minorToMajor } from '../../../schema/shared'

// ── Raw Temu shapes ───────────────────────────────────────────────────────────

/** One row of `result.goodsList` from `bg.local.goods.list.query`. */
export interface RawTemuGoods {
  goodsId?: number
  goodsName?: string
  thumbUrl?: string
  outGoodsSn?: string
  status4VO?: number
  crtTime?: number
  skuInfoList?: Array<Record<string, unknown>>
  [key: string]: unknown
}

/** `result` of `bg.local.goods.detail.query`. */
export interface RawTemuGoodsDetail {
  goodsId?: number
  goodsName?: string
  goodsDesc?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * `status4VO`: "1 for on sale, 4 for unpublished". 5 is the list's
 * `goodsStatusFilterType` value "#5# - Draft". Anything else is left unset.
 */
function mapStatus(status4VO: number | undefined): ProductStatus | undefined {
  if (status4VO === 1) return 'ACTIVE'
  if (status4VO === 4 || status4VO === 5) return 'DRAFT'
  return undefined
}

function requireId(goodsId: number | undefined, what: string): string {
  if (typeof goodsId !== 'number' && typeof goodsId !== 'string')
    throw new Error(`Temu ${what} has no goodsId`)
  return String(goodsId)
}

function requireTitle(goodsName: string | undefined, id: string): string {
  if (typeof goodsName !== 'string' || goodsName === '')
    throw new Error(`Temu goods ${id} has no goodsName`)
  return goodsName
}

// ── Transforms ────────────────────────────────────────────────────────────────

/** A `goodsList` row of `bg.local.goods.list.query` → canonical Product. */
export function transformProduct(raw: RawTemuGoods): Product {
  const id = requireId(raw.goodsId, 'goods list row')
  const product: Product = {
    id,
    title: requireTitle(raw.goodsName, id),
    metadata: raw as Record<string, unknown>,
  }
  const status = mapStatus(raw.status4VO)
  if (status) product.status = status
  if (typeof raw.thumbUrl === 'string' && raw.thumbUrl !== '')
    product.images = [{ url: raw.thumbUrl, position: 0 }]
  if (typeof raw.crtTime === 'number')
    product.createdAt = new Date(raw.crtTime * 1000).toISOString()
  return product
}

/** `result` of `bg.local.goods.detail.query` → canonical Product. */
export function transformProductDetail(raw: RawTemuGoodsDetail): Product {
  const id = requireId(raw.goodsId, 'goods detail')
  const product: Product = {
    id,
    title: requireTitle(raw.goodsName, id),
    metadata: raw as Record<string, unknown>,
  }
  if (typeof raw.goodsDesc === 'string' && raw.goodsDesc !== '') product.description = raw.goodsDesc
  return product
}

/** Canonical Product → Temu goods body for create/update. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    goods_name: product.title,
    goods_desc: product.description,
    category_name: product.productType,
  }
  if (product.images?.[0]) {
    body['goods_cover_img'] = product.images[0].url
  }
  if (product.variants) {
    body['sku_list'] = product.variants.map((v) => ({
      sku_code: v.sku,
      sku_name: v.title,
      price: v.price != null ? minorToMajor(v.price.amount, v.price.currency) : undefined,
      original_price:
        v.compareAtPrice != null
          ? minorToMajor(v.compareAtPrice.amount, v.compareAtPrice.currency)
          : undefined,
    }))
  }
  return body
}
