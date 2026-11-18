/**
 * Swell product / variant → canonical Product / ProductVariant.
 *
 * Fields read, from the product model
 * (https://developers.swell.is/backend-api/products):
 *   id, name ("Human-friendly name of the product."), active ("Indicates
 *   whether the product is active and available in the storefront."),
 *   description, slug, type ("Can be standard, subscription, bundle, or
 *   giftcard."), tags, options[] { id, name, values[] { id, name } },
 *   images[] { id, caption, file { url, width, height } }, date_created,
 *   date_updated.
 *
 * and from the variant model (https://developers.swell.is/backend-api/variants):
 *   id, name, parent_id ("ID of the parent product."), sku, price ("List price
 *   used by default when sale=false or sale_price is not defined. Overrides
 *   parent product price."), orig_price ("Reflects the non-sale price of the
 *   product"), currency ("Three-letter ISO currency code in uppercase."),
 *   option_value_ids, parent ("Expandable link to the parent product.").
 *
 * Product `variants` is an "Expandable list" that the expand argument caps at
 * a default of 5 records ("you may want to specify a limit to include more
 * than the default limit, which is 5"), so products are not expanded: a
 * product with 6 variants would silently lose one. Variants are listed on
 * their own endpoint (listVariants).
 *
 * Money: Swell `currency` fields are decimals in major units; variant price
 * needs the variant's `currency`, or it is refused rather than guessed.
 */

import type { Product, ProductVariant, ProductOption, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Swell shapes ──────────────────────────────────────────────────────

export interface RawSwellImage {
  id?: string
  caption?: string | null
  file?: { url?: string | null; width?: number | null; height?: number | null } | null
  [key: string]: unknown
}

export interface RawSwellOptionValue {
  id?: string
  name: string
  [key: string]: unknown
}

export interface RawSwellOption {
  id?: string
  name: string
  values?: RawSwellOptionValue[] | null
  [key: string]: unknown
}

export interface RawSwellProduct {
  id: string
  name: string
  description?: string | null
  slug?: string | null
  active?: boolean | null
  type?: string | null
  tags?: string[] | null
  options?: RawSwellOption[] | null
  images?: RawSwellImage[] | null
  price?: number | null
  currency?: string | null
  date_created?: string | null
  date_updated?: string | null
  [key: string]: unknown
}

export interface RawSwellVariant {
  id: string
  name?: string | null
  parent_id?: string | null
  sku?: string | null
  price?: number | null
  orig_price?: number | null
  currency?: string | null
  option_value_ids?: string[] | null
  /** Present when requested with `expand=parent`. */
  parent?: RawSwellProduct | null
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(active: boolean | null | undefined): ProductStatus | undefined {
  if (active == null) return undefined
  return active ? 'ACTIVE' : 'DRAFT'
}

function reverseStatus(s: ProductStatus | undefined): boolean | undefined {
  if (!s) return undefined
  switch (s) {
    case 'ACTIVE':
      return true
    case 'DRAFT':
    case 'ARCHIVED':
      return false
    default:
      return undefined
  }
}

function transformImages(raw: RawSwellImage[] | null | undefined): Image[] | undefined {
  const out: Image[] = []
  for (const img of raw ?? []) {
    const url = img.file?.url
    if (!url) continue
    out.push({
      id: img.id,
      url,
      alt: img.caption ?? undefined,
      width: img.file?.width ?? undefined,
      height: img.file?.height ?? undefined,
      position: out.length,
    })
  }
  return out.length > 0 ? out : undefined
}

function transformOption(raw: RawSwellOption): ProductOption {
  return {
    id: raw.id,
    name: raw.name,
    values: (raw.values ?? []).map((v) => v.name),
  }
}

/** Resolve a variant's option_value_ids against its product's options. */
function buildOptionValues(
  optionValueIds: string[] | null | undefined,
  productOptions: RawSwellOption[] | null | undefined,
): Record<string, string> | undefined {
  if (!optionValueIds || optionValueIds.length === 0 || !productOptions) return undefined
  const out: Record<string, string> = {}
  for (const opt of productOptions) {
    for (const val of opt.values ?? []) {
      if (val.id && optionValueIds.includes(val.id)) out[opt.name] = val.name
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * A variant's price overrides its parent's, so a variant without its own
 * `price` sells at the parent product's (read from `expand=parent`).
 */
export function transformProductVariant(raw: RawSwellVariant): ProductVariant {
  const currency = raw.currency
  const price = raw.price ?? raw.parent?.price
  if (price == null || !currency) {
    throw new Error(
      `Swell variant ${raw.id} has no price or currency (price=${String(raw.price)}, ` +
        `parent.price=${String(raw.parent?.price)}, currency=${String(currency)})`,
    )
  }
  const { parent, ...rest } = raw
  return {
    id: raw.id,
    productId: raw.parent_id ?? undefined,
    sku: raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price: { amount: majorToMinor(price, currency), currency },
    compareAtPrice:
      raw.orig_price != null && raw.orig_price > price
        ? { amount: majorToMinor(raw.orig_price, currency), currency }
        : undefined,
    optionValues: buildOptionValues(raw.option_value_ids, parent?.options),
    metadata: rest as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawSwellProduct): Product {
  const options = (raw.options ?? []).map(transformOption)
  return {
    id: raw.id,
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw.active),
    productType: raw.type ?? undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    options: options.length > 0 ? options : undefined,
    images: transformImages(raw.images),
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → Swell product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title !== undefined) body['name'] = product.title
  if (product.description !== undefined) body['description'] = product.description
  if (product.handle !== undefined) body['slug'] = product.handle
  if (product.status !== undefined) body['active'] = reverseStatus(product.status)
  if (product.vendor !== undefined) body['vendor'] = product.vendor
  if (product.productType !== undefined) body['type'] = product.productType
  if (product.tags !== undefined) body['tags'] = product.tags
  if (product.options) {
    body['options'] = product.options.map((o) => ({
      name: o.name,
      values: o.values.map((v) => ({ name: v })),
    }))
  }
  if (product.images) {
    body['images'] = product.images.map((i) => ({
      file: { url: i.url },
    }))
  }
  return body
}

/** Canonical ProductVariant → Swell variant body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (variant.title !== undefined) body['name'] = variant.title
  if (variant.sku !== undefined) body['sku'] = variant.sku
  if (variant.price) body['price'] = variant.price.amount
  if (variant.compareAtPrice) body['orig_price'] = variant.compareAtPrice.amount
  if (variant.weight !== undefined) body['weight'] = variant.weight
  return body
}
