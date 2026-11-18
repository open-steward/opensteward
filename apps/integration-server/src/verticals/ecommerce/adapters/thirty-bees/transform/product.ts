/**
 * Thirty Bees Product / Combination → canonical Product / ProductVariant.
 *
 * Thirty Bees is a fork of PrestaShop 1.6 with an identical webservice API.
 * Products live under `/api/products`. Variants are called "combinations"
 * and live under `/api/combinations`. Each combination is linked to its
 * parent product via `id_product`.
 *
 * Prices are floats stored as decimal strings (e.g. "19.990000").
 * Status is an integer: 1 = active, 0 = inactive.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'

// ── Raw Thirty Bees shapes ──────────────────────────────────────────────────

export interface RawThirtyBeesImage {
  id?: number | string
  id_product?: number | string
  position?: number | string
  legend?: string | null
}

export interface RawThirtyBeesCombination {
  id: number | string
  id_product?: number | string
  reference?: string | null
  ean13?: string | null
  price?: string | number
  weight?: string | number | null
  quantity?: number | null
  minimal_quantity?: number | string
  default_on?: string | number | null
  associations?: {
    product_option_values?: Array<{ id: number | string }>
  }
  [key: string]: unknown
}

export interface RawThirtyBeesProductOptionValue {
  id: number | string
  id_attribute_group?: number | string
  name?: string
}

export interface RawThirtyBeesProductOption {
  id: number | string
  name: string
  position?: number | string
  values?: string[]
}

export interface RawThirtyBeesProduct {
  id: number | string
  name?: string | Record<string, string>
  description?: string | Record<string, string>
  description_short?: string | Record<string, string>
  link_rewrite?: string | Record<string, string>
  reference?: string | null
  price?: string | number
  active?: string | number
  state?: string | number
  date_add?: string
  date_upd?: string
  id_category_default?: number | string | null
  type?: string
  weight?: string | number | null
  meta_title?: string | Record<string, string>
  associations?: {
    categories?: Array<{ id: number | string }>
    images?: Array<{ id: number | string }>
    combinations?: Array<{ id: number | string }>
    product_option_values?: Array<{ id: number | string }>
    tags?: Array<{ id: number | string; name?: string }>
  }
  // Enriched by the adapter before transform:
  _combinations?: RawThirtyBeesCombination[]
  _options?: RawThirtyBeesProductOption[]
  _images?: RawThirtyBeesImage[]
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMoney(v: string | number | null | undefined): number {
  // Thirty Bees stores prices as decimal major-unit strings (e.g. "19.99").
  // Convert to canonical integer minor units (cents).
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Math.round(n * 100)
}

/** Parse a decimal numeric string (e.g. weight) without minor-unit scaling. */
function toDecimal(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Math.round(n * 100) / 100
}

function extractString(v: string | Record<string, string> | undefined | null): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  // Thirty Bees multi-lang fields are { "1": "English text", "2": "French text" }.
  // Return the first available language.
  const vals = Object.values(v)
  return vals.length > 0 ? vals[0] : undefined
}

function mapStatus(active: string | number | undefined): ProductStatus | undefined {
  if (active == null) return undefined
  const n = typeof active === 'string' ? parseInt(active, 10) : active
  return n === 1 ? 'ACTIVE' : 'ARCHIVED'
}

function buildImageUrl(site: string, productId: string | number, imageId: string | number): string {
  return `${site}/api/images/products/${productId}/${imageId}`
}

function transformImage(raw: RawThirtyBeesImage, site?: string): Image {
  const productId = raw.id_product ?? ''
  const url = site ? buildImageUrl(site, productId, raw.id ?? '') : ''
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
    alt: raw.legend ?? undefined,
    position: raw.position != null ? Number(raw.position) : undefined,
  }
}

export function transformProductVariant(
  raw: RawThirtyBeesCombination,
  productId: string,
  basePrice: number = 0,
  currency: string = 'EUR',
): ProductVariant {
  // Combination price in Thirty Bees is a delta from the parent product price.
  // Both are already integer minor units (cents).
  const priceDelta = toMoney(raw.price)
  const effectivePrice = Math.round(basePrice + priceDelta)
  return {
    id: `${productId}:${raw.id}`,
    productId,
    sku: raw.reference || undefined,
    title: undefined,
    price: { amount: effectivePrice, currency },
    weight: raw.weight != null ? toDecimal(raw.weight) : undefined,
    weightUnit: raw.weight != null ? 'kg' : undefined,
    inventoryItemId: String(raw.id),
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
    },
  }
}

export function transformProduct(
  raw: RawThirtyBeesProduct,
  currency: string = 'EUR',
  site?: string,
): Product {
  const productId = String(raw.id)
  const basePrice = toMoney(raw.price)

  // Transform enriched combinations if provided.
  const variants = (raw._combinations ?? []).map((c) =>
    transformProductVariant(c, productId, basePrice, currency),
  )

  // If no combinations, synthesize a single default variant.
  if (variants.length === 0) {
    variants.push({
      id: `${productId}:default`,
      productId,
      sku: raw.reference || undefined,
      price: { amount: basePrice, currency },
      weight: raw.weight != null ? toDecimal(raw.weight) : undefined,
      weightUnit: raw.weight != null ? 'kg' : undefined,
      inventoryItemId: productId,
      metadata: {
        synthetic: true,
        reason: 'Thirty Bees product has no combinations',
        parentProductId: productId,
      },
    })
  }

  // Transform options if enriched.
  const options: ProductOption[] = (raw._options ?? []).map((o) => ({
    id: String(o.id),
    name: o.name,
    values: o.values ?? [],
    position: o.position != null ? Number(o.position) : undefined,
  }))

  // Transform images.
  const images: Image[] = (raw._images ?? []).map((img) => transformImage(img, site))

  const tags = raw.associations?.tags?.map((t) => t.name ?? String(t.id))

  return {
    id: productId,
    title: extractString(raw.name) ?? '',
    description: extractString(raw.description),
    handle: extractString(raw.link_rewrite),
    status: mapStatus(raw.active),
    productType: raw.id_category_default != null ? String(raw.id_category_default) : undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.date_add),
    updatedAt: toIsoDatetime(raw.date_upd),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → Thirty Bees product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    link_rewrite: product.handle,
    active: product.status === 'ACTIVE' ? 1 : product.status === 'ARCHIVED' ? 0 : undefined,
  }
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['price'] = v.price.amount.toString()
    if (v.sku) body['reference'] = v.sku
  }
  return body
}

/** Canonical ProductVariant → Thirty Bees combination body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    reference: variant.sku,
    price: variant.price?.amount?.toString(),
    weight: variant.weight?.toString(),
  }
}
