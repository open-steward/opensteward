/**
 * Faire ExternalProductV2 / ExternalProductVariantV2 → canonical Product /
 * ProductVariant.
 *
 * Shapes from the spec's `components.schemas` (developers.faire.com/docs):
 * a product carries `variants` (ExternalProductVariantV2[]), not the `options`
 * array this transform used to read. Every field read below is a documented
 * property of those schemas.
 */

import type { Product, ProductOption, ProductStatus, ProductVariant } from '../../../schema/product'
import type { Image, Money } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Faire shapes ─────────────────────────────────────────────────────────

/** ExternalMoneyV2: "The amount of money in the smallest unit of the applicable currency." */
export interface RawFaireMoney {
  amount_minor?: number
  currency?: string
}

/** ExternalImageV2. */
export interface RawFaireImage {
  id?: string
  width?: number
  height?: number
  sequence?: number
  url?: string
}

/** ExternalProductVariantV2.Price. */
export interface RawFaireVariantPrice {
  geo_constraint?: { country?: string; country_group?: string }
  wholesale_price?: RawFaireMoney
  retail_price?: RawFaireMoney
}

/** ExternalProductVariantV2. */
export interface RawFaireVariant {
  id: string
  created_at?: string
  updated_at?: string
  product_id?: string
  name?: string
  sale_state?: string
  lifecycle_state?: string
  sku?: string
  /** "If not set in the response, the brand has not set their inventory levels in Faire." */
  available_quantity?: number
  backordered_until?: string
  /** "in cents (US dollars). Deprecated - use prices instead." */
  wholesale_price_cents?: number
  retail_price_cents?: number
  images?: RawFaireImage[]
  options?: { name?: string; value?: string }[]
  prices?: RawFaireVariantPrice[]
  gtin?: string
  [key: string]: unknown
}

/** ExternalProductV2. */
export interface RawFaireProduct {
  id: string
  created_at?: string
  updated_at?: string
  brand_id?: string
  name?: string
  description?: string
  short_description?: string
  sale_state?: string
  /** ExternalProductV2.LifecycleState: DRAFT | PUBLISHED | UNPUBLISHED | DELETED. */
  lifecycle_state?: string
  variants?: RawFaireVariant[]
  images?: RawFaireImage[]
  variant_option_sets?: { name?: string; values?: string[] }[]
  taxonomy_type?: { id?: string; name?: string }
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(raw: RawFaireMoney | undefined): Money | undefined {
  if (raw?.amount_minor == null || !raw.currency) return undefined
  return { amount: raw.amount_minor, currency: raw.currency }
}

/**
 * The variant's wholesale unit price, from documented sources in this order:
 *  1. `prices[]` entry whose `geo_constraint.country` is "USA" (a documented
 *     value) — its `wholesale_price` (ExternalMoneyV2, currency included);
 *  2. `wholesale_price_cents`, documented as "in cents (US dollars)";
 *  3. the only `prices[]` entry carrying a wholesale price, when there is one.
 * A variant with none of these has no documented price, and the canonical
 * variant requires one, so this throws rather than invent it.
 */
export function variantPrice(raw: RawFaireVariant): Money {
  const us = money(raw.prices?.find((p) => p.geo_constraint?.country === 'USA')?.wholesale_price)
  if (us) return us
  if (raw.wholesale_price_cents != null) {
    return { amount: raw.wholesale_price_cents, currency: 'USD' }
  }
  const priced = (raw.prices ?? [])
    .map((p) => money(p.wholesale_price))
    .filter((m): m is Money => m !== undefined)
  if (priced.length === 1) return priced[0]!
  throw new Error(
    `Faire variant ${raw.id} has no single documented wholesale price ` +
      `(no USA prices[] entry, no wholesale_price_cents, ${priced.length} regional prices)`,
  )
}

function transformImage(raw: RawFaireImage): Image | undefined {
  if (!raw.url) return undefined
  return {
    id: raw.id,
    url: raw.url,
    width: raw.width,
    height: raw.height,
    position: raw.sequence,
  }
}

function mapStatus(state: string | undefined): ProductStatus | undefined {
  switch (state) {
    case 'PUBLISHED':
      return 'ACTIVE'
    case 'DRAFT':
      return 'DRAFT'
    case 'UNPUBLISHED':
    case 'DELETED':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

// ── ProductVariant ───────────────────────────────────────────────────────────

/**
 * The canonical id of a Faire variant: `productId:variantId` (e.g.
 * `p_123:po_123`). The spec has no variant read — a variant is read, updated
 * and restocked only under its product (GET /products/{product_id}, PATCH
 * /products/{product_id}/variants/{variant_id}) — so an id that names the
 * variant alone could never be read back. Built from the documented
 * `ExternalProductV2.id` and `ExternalProductVariantV2.id`, and used for every
 * reference to a variant (ProductVariant.id, InventoryLevel.variantId,
 * LineItem.variantId) so the ids join across resources.
 */
export function faireVariantKey(productId: string, variantId: string): string {
  return `${productId}:${variantId}`
}

export function transformVariant(raw: RawFaireVariant, productId: string): ProductVariant {
  const optionValues: Record<string, string> = {}
  for (const o of raw.options ?? []) {
    if (o.name && o.value) optionValues[o.name] = o.value
  }
  return {
    id: faireVariantKey(productId, raw.id),
    productId,
    sku: raw.sku || undefined,
    barcode: raw.gtin || undefined,
    title: raw.name || undefined,
    price: variantPrice(raw),
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical ProductVariant → Faire variant update body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    name: variant.title,
  }
}

// ── Product ──────────────────────────────────────────────────────────────────

function productOptions(raw: RawFaireProduct): ProductOption[] | undefined {
  const out: ProductOption[] = []
  for (const set of raw.variant_option_sets ?? []) {
    if (set.name && Array.isArray(set.values)) out.push({ name: set.name, values: set.values })
  }
  return out.length > 0 ? out : undefined
}

export function transformProduct(raw: RawFaireProduct): Product {
  if (!raw.name) {
    throw new Error(`Faire product ${raw.id} has no name`)
  }
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, raw.id))
  const images = (raw.images ?? []).map(transformImage).filter((i): i is Image => i !== undefined)

  return {
    id: raw.id,
    title: raw.name,
    description: raw.description || undefined,
    status: mapStatus(raw.lifecycle_state),
    productType: raw.taxonomy_type?.name || undefined,
    variants: variants.length > 0 ? variants : undefined,
    options: productOptions(raw),
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Faire product create/update body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    active: product.status != null ? product.status === 'ACTIVE' : undefined,
  }
  if (product.variants && product.variants.length > 0) {
    body.options = product.variants.map((v) => ({
      id: v.id,
      name: v.title,
      sku: v.sku,
    }))
  }
  return body
}
