/**
 * Haravan Product / Variant / Image → canonical.
 *
 * Haravan's Product resource is Shopify-shaped (same field names: `body_html`,
 * `variants[].option1/2/3`, `images[].src`), with two differences this
 * transform accounts for:
 *
 *  - `options[]` carries `{ name, id, position }` with no `values` array —
 *    unlike Shopify, Haravan does not enumerate an option's allowed values on
 *    the option itself. We derive them from the distinct `option1`/`option2`/
 *    `option3` strings actually used across the product's variants.
 *  - Variants report inventory directly (`inventory_quantity`,
 *    `inventory_advance`) rather than through a separate location-scoped
 *    inventory-item id, so `inventoryItemId` here is the variant id itself —
 *    the same id `POST /inventories/adjustorset.json` calls
 *    `product_variant_id`.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/products/,
 *       https://docs.haravan.com/docs/omni-apis/product-variants/,
 *       https://docs.haravan.com/docs/omni-apis/product-images/
 */

import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawHaravanImage {
  id: number | string
  product_id?: number | string
  position?: number
  src?: string
  filename?: string
  variant_ids?: Array<number | string>
}

export interface RawHaravanInventoryAdvance {
  qty_available?: number
  qty_onhand?: number
  qty_commited?: number
  qty_incoming?: number
}

export interface RawHaravanVariant {
  id: number | string
  product_id?: number | string
  title?: string
  price?: string | number
  compare_at_price?: string | number | null
  sku?: string | null
  barcode?: string | null
  position?: number
  grams?: number
  taxable?: boolean
  requires_shipping?: boolean
  inventory_management?: string | null
  inventory_policy?: string | null
  inventory_quantity?: number | null
  inventory_advance?: RawHaravanInventoryAdvance | null
  option1?: string | null
  option2?: string | null
  option3?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawHaravanOption {
  id?: number | string
  product_id?: number | string
  name: string
  position?: number
}

export interface RawHaravanProduct {
  id: number | string
  title: string
  body_html?: string | null
  handle?: string
  vendor?: string
  product_type?: string
  tags?: string
  options?: RawHaravanOption[]
  variants?: RawHaravanVariant[]
  images?: RawHaravanImage[]
  created_at?: string
  updated_at?: string
  published_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoneyAmount(v: string | number | null | undefined, currency: string): number {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (n == null || !Number.isFinite(n)) {
    throw new Error(`Haravan reported no valid price (${JSON.stringify(v)}) — refusing to invent a 0 amount.`)
  }
  return majorToMinor(n, currency)
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** An image without a `src` has nothing to point at, so it is skipped rather than given an empty URL. */
function transformImage(raw: RawHaravanImage): Image | undefined {
  if (!raw.src) return undefined
  return {
    id: String(raw.id),
    url: raw.src,
    position: raw.position,
  }
}

/**
 * Haravan options carry no `values` array (unlike Shopify) — derive the
 * distinct values actually used by this product's variants at this option's
 * position (`option1` for position 1, etc).
 */
function transformOptions(
  options: RawHaravanOption[] | undefined,
  variants: RawHaravanVariant[] | undefined,
): ProductOption[] {
  if (!options || options.length === 0) return []
  const positional = (v: RawHaravanVariant, i: number): string | undefined =>
    (i === 0 ? v.option1 : i === 1 ? v.option2 : v.option3) ?? undefined
  return options.map((o, i) => {
    const seen = new Set<string>()
    const values: string[] = []
    for (const v of variants ?? []) {
      const val = positional(v, i)
      if (val != null && !seen.has(val)) {
        seen.add(val)
        values.push(val)
      }
    }
    return {
      id: o.id != null ? String(o.id) : undefined,
      name: o.name,
      values,
      position: o.position,
    }
  })
}

function buildOptionValues(
  variant: RawHaravanVariant,
  options: RawHaravanOption[] | undefined,
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
  raw: RawHaravanVariant,
  currency: string,
  options?: RawHaravanOption[],
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
    weight: raw.grams,
    weightUnit: raw.grams != null ? 'g' : undefined,
    // Haravan has no separate inventory-item id — the variant id is what
    // `POST /inventories/adjustorset.json` calls `product_variant_id`.
    inventoryItemId: String(raw.id),
    optionValues: buildOptionValues(raw, options),
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawHaravanProduct, currency: string): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency, raw.options))
  const images = (raw.images ?? []).map(transformImage).filter((i): i is Image => i !== undefined)
  const options = transformOptions(raw.options, raw.variants)

  return {
    id: String(raw.id),
    title: raw.title,
    description: raw.body_html ?? undefined,
    // Haravan's own docs show a mixed-case example ("iPod-nano") — the
    // canonical Slug is lowercase-only, so this case-folds rather than
    // dropping (or failing to parse) an otherwise-real handle.
    handle: raw.handle?.toLowerCase(),
    // Haravan's Product resource has no ACTIVE/ARCHIVED/DRAFT status field —
    // best-effort derive it from `published_at`, matching what the field
    // actually controls (visibility on the Online Store channel).
    status: raw.published_at ? 'ACTIVE' : 'DRAFT',
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

/** Canonical Product → Haravan product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    body_html: product.description,
    handle: product.handle,
    vendor: product.vendor,
    product_type: product.productType,
  }
  if (product.tags) body.tags = product.tags.join(', ')
  if (product.options) {
    body.options = product.options.map((o) => ({ name: o.name, position: o.position }))
  }
  if (product.variants) {
    body.variants = product.variants.map((v) => untransformVariant(v))
  }
  if (product.images) {
    body.images = product.images.map((i) => ({ id: i.id, src: i.url, position: i.position }))
  }
  return body
}

/** Canonical ProductVariant → Haravan variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    title: variant.title,
    price: variant.price?.amount,
    compare_at_price: variant.compareAtPrice?.amount,
    grams: variant.weight,
    taxable: variant.taxable,
    requires_shipping: variant.requiresShipping,
    position: variant.position,
  }
}
