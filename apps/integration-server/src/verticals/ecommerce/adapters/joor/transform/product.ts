/**
 * JOOR Product / SKU → canonical Product / ProductVariant.
 *
 * JOOR v4 separates "products" (styles) and "SKUs" (size/colour variants).
 * Products carry: id, name, external_id, description, images, tags,
 *   product_trait_values, categories.
 * SKUs carry: id, product_id, sku_identifier, external_id, identifiers
 *   (upc etc.), trait_values (Size, Color…).
 *
 * JOOR does not expose prices on the product/SKU endpoints directly; the
 * Prices endpoint is separate and optional.
 *
 * Docs: https://api-docs.jooraccess.com/reference/products.md
 *       https://api-docs.jooraccess.com/reference/skus.md
 */

import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw JOOR shapes ──────────────────────────────────────────────────────────

export interface RawJoorImage {
  id?: string
  url?: string
}

export interface RawJoorTraitValue {
  trait?: { id?: string; name?: string }
  value?: string
  external_id?: string
  order_minimum?: number
  status?: string
  order_nbr?: number
}

export interface RawJoorTag {
  id?: string
  name?: string
  value?: string
  code?: string
  parent_id?: string
}

export interface RawJoorCategory {
  id?: string
  name?: string
  parent_name?: string
  department?: string
}

export interface RawJoorProduct {
  id: string
  name: string
  external_id?: string
  product_identifier?: string
  description?: string | null
  order_minimum?: number
  images?: RawJoorImage[]
  categories?: RawJoorCategory[]
  product_trait_values?: RawJoorTraitValue[]
  tags?: RawJoorTag[]
  badge?: { id?: string; name?: string; url?: string; visible?: boolean }
  [key: string]: unknown
}

export interface RawJoorSkuIdentifier {
  type?: string
  value?: string
}

export interface RawJoorSku {
  id: string
  product_id?: string
  sku_identifier?: string
  external_id?: string
  identifiers?: RawJoorSkuIdentifier[]
  trait_values?: RawJoorTraitValue[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function transformImage(raw: RawJoorImage, position: number): Image | undefined {
  if (!raw.url) return undefined
  return {
    id: raw.id,
    url: raw.url,
    position,
  }
}

/**
 * Build a `ProductOption` list from a set of SKU trait values (e.g. Size,
 * Color). We collect the distinct trait names and their values across all
 * SKUs passed in.
 */
function buildOptionsFromSkus(skus: RawJoorSku[]): ProductOption[] {
  const traitMap = new Map<string, Set<string>>()
  for (const sku of skus) {
    for (const tv of sku.trait_values ?? []) {
      const name = tv.trait?.name
      const value = tv.value
      if (!name || !value) continue
      if (!traitMap.has(name)) traitMap.set(name, new Set())
      traitMap.get(name)!.add(value)
    }
  }
  return Array.from(traitMap.entries()).map(([name, values]) => ({
    name,
    values: Array.from(values),
  }))
}

function buildBarcode(identifiers: RawJoorSkuIdentifier[] | undefined): string | undefined {
  if (!identifiers) return undefined
  const upc = identifiers.find((i) => i.type?.toLowerCase() === 'upc')
  return upc?.value ?? identifiers[0]?.value ?? undefined
}

function buildOptionValues(sku: RawJoorSku): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const tv of sku.trait_values ?? []) {
    const name = tv.trait?.name
    const value = tv.value
    if (name && value) out[name] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

/**
 * JOOR SKU → canonical variant. Used only by the updateVariant write path;
 * the price below has no documented source (see transformProduct) and the
 * read methods refuse instead of serving it.
 */
export function transformSku(raw: RawJoorSku): ProductVariant {
  return {
    id: raw.id,
    productId: raw.product_id ?? undefined,
    sku: raw.sku_identifier ?? raw.external_id ?? undefined,
    barcode: buildBarcode(raw.identifiers),
    // JOOR SKUs do not carry a price at the SKU level (use Prices endpoint)
    price: { amount: 0, currency: 'USD' },
    optionValues: buildOptionValues(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawJoorProduct, skus?: RawJoorSku[]): Product {
  const productSkus = skus ?? []
  const images = (raw.images ?? [])
    .map((img, i) => transformImage(img, i))
    .filter((img): img is Image => img != null)

  const tags = (raw.tags ?? [])
    .map((t) => [t.name, t.value].filter(Boolean).join(':'))
    .filter((t) => t.length > 0)

  // SKUs feed only the option matrix. No canonical variant is embedded:
  // ProductVariant.price is required and GET /v4/skus documents no price
  // (https://api-docs.jooraccess.com/reference/get-skus.md), while v4 prices
  // are write-only (POST /prices/bulk_create).
  const options = buildOptionsFromSkus(productSkus)

  return {
    id: raw.id,
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.external_id ?? raw.product_identifier ?? undefined,
    vendor: undefined,
    productType: raw.categories?.[0]?.name ?? undefined,
    tags: tags.length > 0 ? tags : undefined,
    options: options.length > 0 ? options : undefined,
    images: images.length > 0 ? images : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → JOOR product body for bulk_create. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    external_id: product.handle,
    description: product.description,
    tags: product.tags?.map((t) => {
      const [name, value] = t.split(':')
      return { name, value: value ?? '' }
    }),
  }
}

/** Canonical ProductVariant → JOOR SKU body for create. */
export function untransformSku(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku_identifier: variant.sku,
    external_id: variant.sku,
    identifiers: variant.barcode ? [{ type: 'upc', value: variant.barcode }] : undefined,
    trait_values: variant.optionValues
      ? Object.entries(variant.optionValues).map(([name, value]) => ({
          trait_name: name,
          value,
        }))
      : undefined,
  }
}
