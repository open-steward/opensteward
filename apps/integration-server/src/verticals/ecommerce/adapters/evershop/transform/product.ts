/**
 * EverShop Product → canonical Product / ProductVariant.
 *
 * EverShop models products with a `price` as a decimal number, a `status`
 * integer (1 = enabled, 0 = disabled), a `url_key` slug, and an `image`
 * string path. Variants belong to a `variant_group` and are linked via a
 * separate variantGroups API — the adapter inlines them when available via
 * the optional `variants` field on the raw shape.
 *
 * Prices come as numbers (`19.99`); statuses come as integers (0/1).
 *
 * Docs: https://evershop.io/docs/api/product
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw EverShop shapes (minimal) ────────────────────────────────────────────

export interface RawEverShopProductImage {
  url?: string
  /** alt text — EverShop does not store alt on images */
}

/** A single product as returned by the EverShop REST API. */
export interface RawEverShopProduct {
  product_id?: number | string
  uuid?: string
  name: string
  sku?: string | null
  price?: number | string | null
  short_description?: string | null
  description?: string | null
  url_key?: string | null
  status?: number | string | boolean | null
  visibility?: number | string | boolean | null
  weight?: number | string | null
  qty?: number | string | null
  image?: string | null
  created_at?: string | null
  updated_at?: string | null
  variant_group_id?: number | string | null
  group_id?: number | string | null
  /** Pre-fetched variant items (not in the default API response). */
  variants?: RawEverShopVariantItem[]
  [key: string]: unknown
}

/** An item inside a variant group. */
export interface RawEverShopVariantItem {
  id?: number | string
  product?: RawEverShopProduct
  attributes?: Array<{
    attribute_id?: number | string
    attribute_code?: string
    option_id?: number | string
    option_text?: string
  }>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinorUnits(v: number | string | null | undefined, currency: string): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return majorToMinor(n, currency)
}

function mapStatus(s: number | string | boolean | null | undefined): ProductStatus | undefined {
  if (s == null) return undefined
  const n = typeof s === 'boolean' ? (s ? 1 : 0) : Number(s)
  if (n === 1) return 'ACTIVE'
  if (n === 0) return 'ARCHIVED'
  return undefined
}

function buildImageFromPath(path: string | null | undefined): Image | undefined {
  if (!path) return undefined
  const url =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : path.startsWith('/')
        ? path
        : `/${path}`
  return { url }
}

function buildOptionValues(
  attributes: RawEverShopVariantItem['attributes'],
): Record<string, string> | undefined {
  if (!attributes || attributes.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attributes) {
    if (a.attribute_code && a.option_text) {
      out[a.attribute_code] = a.option_text
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariantItem(
  raw: RawEverShopVariantItem,
  parentId: string,
  currency: string,
): ProductVariant | undefined {
  const p = raw.product
  if (!p) return undefined
  const id = p.uuid ?? (p.product_id != null ? String(p.product_id) : undefined)
  if (!id) return undefined

  return {
    id,
    productId: parentId,
    sku: p.sku ?? undefined,
    price: { amount: toMinorUnits(p.price, currency), currency },
    weight: p.weight != null ? Number(p.weight) : undefined,
    weightUnit: 'kg',
    optionValues: buildOptionValues(raw.attributes),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawEverShopProduct, currency: string = 'USD'): Product {
  const id = raw.uuid ?? (raw.product_id != null ? String(raw.product_id) : String(raw.name))

  const image = buildImageFromPath(raw.image)
  const images = image ? [image] : undefined

  const variantItems = raw.variants ?? []
  const variants = variantItems
    .map((v) => transformVariantItem(v, id, currency))
    .filter((v): v is ProductVariant => v !== undefined)

  // For products without a variant group, synthesize a single default variant.
  if (variants.length === 0) {
    variants.push({
      id: `${id}:default`,
      productId: id,
      sku: raw.sku ?? undefined,
      price: { amount: toMinorUnits(raw.price, currency), currency },
      weight: raw.weight != null ? Number(raw.weight) : undefined,
      weightUnit: 'kg',
      metadata: {
        synthetic: true,
        reason: 'EverShop product has no variant group',
        parentProductId: id,
      },
    })
  }

  return {
    id,
    title: raw.name,
    description: raw.description ?? raw.short_description ?? undefined,
    handle: raw.url_key ?? undefined,
    status: mapStatus(raw.status),
    variants: variants.length > 0 ? variants : undefined,
    images,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → EverShop product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    url_key: product.handle,
  }
  if (product.status != null) {
    body['status'] = product.status === 'ACTIVE' ? 1 : 0
  }
  // Flatten price from first variant if present
  if (product.variants && product.variants.length > 0) {
    const v = product.variants[0]!
    if (v.price?.amount != null) {
      // Convert minor units back to major decimal
      body['price'] = v.price.amount / 100
    }
    if (v.sku) body['sku'] = v.sku
    if (v.weight != null) body['weight'] = v.weight
  }
  if (product.images && product.images.length > 0) {
    body['images'] = product.images.map((i) => i.url)
  }
  return body
}
