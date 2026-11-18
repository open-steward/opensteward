/**
 * Bold Products API → canonical Product / ProductVariant.
 *
 * Shapes from https://developer.boldcommerce.com/api/products.openapi.yaml:
 * `v2DeepProduct` ({ product, images, variants, options, categories }; the
 * child arrays are "Included in the response when the query parameter `deep`
 * is set to `true`"), `v2Product`, `v2Variant`, `v2Option`, `v2Image`.
 */
import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import type { Image, Money } from '../../../schema/shared'
import { assetUrl, slug, splitTags } from '../fields'

export interface RawBoldProduct {
  id: number
  shop_identifier?: string
  platform_id?: unknown
  name?: string
  handle?: string
  description?: string
  type?: string
  vendor?: string
  inventory_quantity?: number
  tags?: string
  created_at?: string
  updated_at?: string
  published?: boolean
  url?: string
  [key: string]: unknown
}

export interface RawBoldVariant {
  id: number
  shop_identifier?: string
  platform_id?: unknown
  platform_product_id?: unknown
  name?: string
  sku?: string
  weight_unit?: string
  grams?: number
  image_url?: string
  inventory_quantity?: number
  allow_backorder?: boolean
  created_at?: string
  updated_at?: string
  require_shipping?: boolean
  /** "The base price of the variant with no adjustments or sales." */
  price?: number
  cost?: number
  /** "The original price of the variant before an adjustment or a sale." */
  compare_at_price?: number
  tax_code?: string
  weight?: number
  tax_exempt?: boolean
  [key: string]: unknown
}

export interface RawBoldOptionValue {
  id?: number
  label?: string
  position?: number
  [key: string]: unknown
}

export interface RawBoldOption {
  id?: number
  name?: string
  position?: number
  values?: RawBoldOptionValue[]
  [key: string]: unknown
}

export interface RawBoldImage {
  id?: number
  src?: string
  position?: number
  [key: string]: unknown
}

export interface RawBoldDeepProduct {
  product: RawBoldProduct
  images?: RawBoldImage[]
  variants?: RawBoldVariant[]
  options?: RawBoldOption[]
  categories?: unknown[]
}

function money(amount: number, currency: string): Money {
  return { amount: majorToMinor(amount, currency), currency }
}

/**
 * `currency` is the shop's ISO-4217 currency from Get Shop Info, stored on the
 * connection. `price` is a required canonical field: a variant without one is
 * an error, not a zero.
 */
export function transformBoldVariant(
  raw: RawBoldVariant,
  currency: string,
  productId?: string,
): ProductVariant {
  if (typeof raw.price !== 'number' || !Number.isFinite(raw.price)) {
    throw new Error(`Bold variant ${raw.id} has no price`)
  }
  const out: ProductVariant = {
    id: String(raw.id),
    price: money(raw.price, currency),
    metadata: { ...raw },
  }
  if (productId !== undefined) out.productId = productId
  if (raw.sku) out.sku = raw.sku
  if (raw.name) out.title = raw.name
  if (typeof raw.compare_at_price === 'number' && Number.isFinite(raw.compare_at_price)) {
    out.compareAtPrice = money(raw.compare_at_price, currency)
  }
  // `grams`: "The weight of the variant in grams."
  if (typeof raw.grams === 'number' && raw.grams >= 0) {
    out.weight = raw.grams
    out.weightUnit = 'g'
  }
  // `tax_exempt`: "Indicates whether the variant is tax-exempt."
  if (typeof raw.tax_exempt === 'boolean') out.taxable = !raw.tax_exempt
  if (typeof raw.require_shipping === 'boolean') out.requiresShipping = raw.require_shipping
  return out
}

function transformOption(raw: RawBoldOption): ProductOption | undefined {
  if (!raw.name) return undefined
  const option: ProductOption = {
    name: raw.name,
    values: (raw.values ?? []).map((v) => v.label).filter((l): l is string => !!l),
  }
  if (raw.id !== undefined) option.id = String(raw.id)
  return option
}

function transformImage(raw: RawBoldImage): Image | undefined {
  const url = assetUrl(raw.src)
  if (!url) return undefined
  const image: Image = { url }
  if (raw.id !== undefined) image.id = String(raw.id)
  return image
}

export function transformBoldProduct(raw: RawBoldDeepProduct, currency: string): Product {
  const p = raw.product
  const id = String(p.id)
  if (!p.name) throw new Error(`Bold product ${id} has no name`)
  const out: Product = {
    id,
    title: p.name,
    metadata: { ...raw },
  }
  if (p.description) out.description = p.description
  const handle = slug(p.handle)
  if (handle) out.handle = handle
  // `published`: "Indicates whether the product is published on the storefront."
  if (typeof p.published === 'boolean') out.status = p.published ? 'ACTIVE' : 'DRAFT'
  if (p.vendor) out.vendor = p.vendor
  if (p.type) out.productType = p.type
  const tags = splitTags(p.tags)
  if (tags) out.tags = tags
  const createdAt = toIsoDatetime(p.created_at)
  if (createdAt) out.createdAt = createdAt
  const updatedAt = toIsoDatetime(p.updated_at)
  if (updatedAt) out.updatedAt = updatedAt
  if (raw.options) {
    out.options = raw.options.map(transformOption).filter((o): o is ProductOption => !!o)
  }
  if (raw.variants) out.variants = raw.variants.map((v) => transformBoldVariant(v, currency, id))
  if (raw.images) out.images = raw.images.map(transformImage).filter((i): i is Image => !!i)
  return out
}
