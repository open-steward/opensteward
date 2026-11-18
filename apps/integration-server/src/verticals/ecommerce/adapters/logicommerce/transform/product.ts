/**
 * Shopify Product / Variant / Image → canonical.
 *
 * Shopify returns products with nested variants, images, and options. We
 * flatten them into the canonical shape where variants and images are
 * first-class arrays on the product.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shopify shapes (minimal) ─────────────────────────────────────────────

export interface RawShopifyImage {
  id: number | string
  product_id?: number | string
  position?: number
  src?: string
  alt?: string | null
  width?: number
  height?: number
}

export interface RawShopifyVariant {
  id: number | string
  product_id?: number | string
  title?: string
  price?: string | number
  compare_at_price?: string | number | null
  sku?: string
  barcode?: string | null
  position?: number
  inventory_item_id?: number | string
  weight?: number
  weight_unit?: string
  taxable?: boolean
  requires_shipping?: boolean
  option1?: string | null
  option2?: string | null
  option3?: string | null
}

export interface RawShopifyOption {
  id?: number | string
  product_id?: number | string
  name: string
  position?: number
  values: string[]
}

export interface RawShopifyProduct {
  id: number | string
  title: string
  body_html?: string | null
  handle?: string
  status?: string
  vendor?: string
  product_type?: string
  tags?: string
  options?: RawShopifyOption[]
  variants?: RawShopifyVariant[]
  images?: RawShopifyImage[]
  created_at?: string
  updated_at?: string
  published_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(n, currency)
}

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  const up = s.toUpperCase()
  if (up === 'ACTIVE' || up === 'ARCHIVED' || up === 'DRAFT') return up
  return undefined
}

function mapWeightUnit(u: string | undefined): WeightUnit | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function transformImage(raw: RawShopifyImage): Image {
  return {
    id: String(raw.id),
    url: raw.src ?? '',
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position,
  }
}

function transformOption(raw: RawShopifyOption): ProductOption {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name,
    values: raw.values ?? [],
    position: raw.position,
  }
}

/**
 * Build the canonical `optionValues` record for a variant by reading the
 * parent product's option names and matching them against Shopify's
 * `option1`/`option2`/`option3` positional fields.
 */
function buildOptionValues(
  variant: RawShopifyVariant,
  options: RawShopifyOption[] | undefined,
): Record<string, string> | undefined {
  if (!options || options.length === 0) return undefined
  const out: Record<string, string> = {}
  const positional = [variant.option1, variant.option2, variant.option3]
  for (let i = 0; i < options.length; i++) {
    const val = positional[i]
    if (val != null) out[options[i]!.name] = val
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawShopifyVariant,
  currency: string = 'USD',
  options?: RawShopifyOption[],
): ProductVariant {
  const compareAt = raw.compare_at_price
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.sku || undefined,
    barcode: raw.barcode ?? undefined,
    title: raw.title,
    price: { amount: toMoneyAmount(raw.price, currency), currency },
    compareAtPrice:
      compareAt != null && compareAt !== ''
        ? { amount: toMoneyAmount(compareAt, currency), currency }
        : undefined,
    weight: raw.weight,
    weightUnit: mapWeightUnit(raw.weight_unit),
    inventoryItemId: raw.inventory_item_id != null ? String(raw.inventory_item_id) : undefined,
    optionValues: buildOptionValues(raw, options),
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawShopifyProduct, currency: string = 'USD'): Product {
  const variants = (raw.variants ?? []).map((v) =>
    transformVariant(v, currency, raw.options),
  )
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.options ?? []).map(transformOption)

  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.body_html ?? undefined,
    handle: raw.handle,
    status: mapStatus(raw.status),
    vendor: raw.vendor || undefined,
    productType: raw.product_type || undefined,
    tags: splitTags(raw.tags),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Shopify product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    body_html: product.description,
    handle: product.handle,
    vendor: product.vendor,
    product_type: product.productType,
    status: product.status ? product.status.toLowerCase() : undefined,
  }
  if (product.tags) body.tags = product.tags.join(', ')
  if (product.options) {
    body.options = product.options.map((o) => ({
      name: o.name,
      values: o.values,
      position: o.position,
    }))
  }
  if (product.variants) {
    body.variants = product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      title: v.title,
      price: v.price?.amount,
      compare_at_price: v.compareAtPrice?.amount,
      weight: v.weight,
      weight_unit: v.weightUnit,
      taxable: v.taxable,
      requires_shipping: v.requiresShipping,
      position: v.position,
    }))
  }
  if (product.images) {
    body.images = product.images.map((i) => ({
      id: i.id,
      src: i.url,
      alt: i.alt,
      position: i.position,
    }))
  }
  return body
}

/** Canonical ProductVariant → Shopify variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    title: variant.title,
    price: variant.price?.amount,
    compare_at_price: variant.compareAtPrice?.amount,
    weight: variant.weight,
    weight_unit: variant.weightUnit,
    taxable: variant.taxable,
    requires_shipping: variant.requiresShipping,
    position: variant.position,
  }
}
