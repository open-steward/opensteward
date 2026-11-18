/**
 * Tmall / TOP item → canonical Product + ProductVariant.
 *
 * TOP items have flat SKU arrays (`sku` list). The item's `num_iid` is the
 * canonical product id; each SKU's `sku_id` is the variant id.
 *
 * Prices in TOP are decimal strings in CNY (e.g. `"199.00"`).
 *
 * Status mapping (approve_status):
 *   onsale  → ACTIVE
 *   instock → DRAFT  (listed but not on sale)
 *   delete  → ARCHIVED
 */

import type { Product, ProductStatus, ProductVariant } from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTmallSku {
  sku_id?: string | number
  /** Parent item's numeric id. Present on `taobao.item.skus.get` (a list can
   *  span several products); optional on `taobao.item.sku.get`, whose caller
   *  already supplied it as a request param. */
  num_iid?: string | number
  outer_id?: string
  properties?: string
  properties_name?: string
  quantity?: number
  price?: string
  modified?: string
  status?: string
  [key: string]: unknown
}

export interface RawTmallItemImg {
  url?: string
  position?: number
  [key: string]: unknown
}

export interface RawTmallItem {
  num_iid?: string | number
  title?: string
  desc?: string
  price?: string
  approve_status?: string
  created?: string
  modified?: string
  type?: string
  pic_url?: string
  detail_url?: string
  /** Nested SKU list. */
  sku?: RawTmallSku[]
  /** Extra product images. */
  item_imgs?: RawTmallItemImg[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a TOP `approve_status` value to canonical ProductStatus.
 */
export function mapProductStatus(approveStatus: string | undefined): ProductStatus | undefined {
  if (!approveStatus) return undefined
  switch (approveStatus.toLowerCase()) {
    case 'onsale':
      return 'ACTIVE'
    case 'instock':
      return 'DRAFT'
    case 'delete':
    case 'deleted':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

/**
 * Parse a TOP price string (e.g. `"199.00"`) to a number. Returns 0 if invalid.
 */
export function parseTmallPrice(val: string | number | undefined): number {
  if (val == null) return 0
  const n = typeof val === 'number' ? val : parseFloat(val)
  return Number.isNaN(n) ? 0 : n
}

function buildImages(raw: RawTmallItem): Image[] | undefined {
  const extras: Image[] = (raw.item_imgs ?? []).map((img, i) => ({
    url: img.url ?? '',
    position: img.position ?? i + 1,
  }))
  // Prepend the main picture if present
  if (raw.pic_url) {
    extras.unshift({ url: raw.pic_url, position: 0 })
  }
  return extras.length > 0 ? extras.filter((img) => img.url) : undefined
}

/**
 * Map a TOP SKU to a canonical ProductVariant.
 */
export function transformVariant(
  sku: RawTmallSku,
  productId: string,
  currency: string,
): ProductVariant {
  return {
    id: String(sku.sku_id ?? sku.outer_id ?? ''),
    productId,
    sku: sku.outer_id ?? undefined,
    title: sku.properties_name ?? sku.properties ?? undefined,
    // TOP reports major units ("199.99" CNY); canonical Money.amount is an
    // integer in minor units, so the conversion is currency-aware, not /100.
    price: { amount: majorToMinor(parseTmallPrice(sku.price), currency), currency },
    metadata: sku as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * TOP item → canonical Product.
 *
 * `num_iid` becomes the canonical `id`. SKUs become variants.
 * The complete raw object is stored in `metadata`.
 */
export function transformProduct(raw: RawTmallItem, currency = 'CNY'): Product {
  const productId = String(raw.num_iid ?? '')
  const skus = raw.sku ?? []
  const variants = skus.map((sku) => transformVariant(sku, productId, currency))
  const images = buildImages(raw)

  return {
    id: productId,
    title: raw.title ?? productId,
    description: raw.desc ?? undefined,
    status: mapProductStatus(raw.approve_status),
    productType: raw.type ?? undefined,
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → TOP item update payload.
 *
 * Used for `taobao.item.update`. Only a subset of fields can be changed
 * via the update API; unsupported fields are silently ignored.
 */
export function untransformProduct(
  product: Partial<Product>,
): Record<string, string | number | undefined> {
  return {
    num_iid: product.id ? Number(product.id) : undefined,
    title: product.title,
    desc: product.description ?? undefined,
    approve_status:
      product.status === 'ACTIVE'
        ? 'onsale'
        : product.status === 'DRAFT'
          ? 'instock'
          : product.status === 'ARCHIVED'
            ? 'delete'
            : undefined,
    // Canonical Money.amount is integer minor units; TOP wants a major-unit
    // decimal string. Without the conversion back this writes a price 100x too
    // high — the read path's own inverse, and the reason both directions moved
    // together.
    price: minorToMajor(
      product.variants?.[0]?.price?.amount,
      product.variants?.[0]?.price?.currency,
    )?.toFixed(2),
  }
}

// ── On-sale item list (taobao.items.onsale.get) ───────────────────────────────

/**
 * An `Item` as `taobao.items.onsale.get` returns it
 * (https://open.taobao.com/api.htm?docId=18&docType=2). That method answers
 * only the fields named in `fields`, from a fixed list ("不支持其他字段，如果需要
 * 获取其他字段数据，调用taobao.item.seller.get 获取"), so an on-sale item carries
 * no `desc`, `sku`, `item_imgs` or `created`.
 */
export interface RawTmallOnsaleItem {
  /** 商品数字id */
  num_iid?: number | string
  /** 商品标题,不能超过60字节 */
  title?: string
  /** 商品上传后的状态。onsale出售中，instock库中 */
  approve_status?: string
  /** 商品主图片地址 */
  pic_url?: string
  /** 上架时间（格式：yyyy-MM-dd HH:mm:ss） */
  list_time?: string
  /** 商品修改时间（格式：yyyy-MM-dd HH:mm:ss） */
  modified?: string
  [key: string]: unknown
}

/** The `fields` sent to `taobao.items.onsale.get`, each from its documented list. */
export const ONSALE_ITEM_FIELDS = 'num_iid,title,approve_status,pic_url,list_time,modified'

/**
 * `taobao.items.onsale.get` item → canonical Product. Throws when `num_iid`
 * or `title` is missing: both are requested, and both are required canonical
 * fields with no other documented source.
 */
export function transformOnsaleItem(raw: RawTmallOnsaleItem): Product {
  if (raw.num_iid === undefined || raw.num_iid === null || raw.num_iid === '') {
    throw new Error('Tmall on-sale item has no num_iid')
  }
  const id = String(raw.num_iid)
  if (!raw.title) throw new Error(`Tmall on-sale item ${id} has no title`)
  const status = mapProductStatus(raw.approve_status)
  const updatedAt = toIsoDatetime(raw.modified)
  const publishedAt = toIsoDatetime(raw.list_time)
  return {
    id,
    title: raw.title,
    ...(status ? { status } : {}),
    ...(raw.pic_url ? { images: [{ url: raw.pic_url, position: 0 }] } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
