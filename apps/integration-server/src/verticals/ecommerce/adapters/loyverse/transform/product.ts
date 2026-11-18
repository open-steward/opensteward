/**
 * Loyverse Item / Variant → canonical Product / ProductVariant.
 *
 * Loyverse calls products "items" and uses `item_name` (not `title`).
 * Each item has up to three option axes (option1Name/2Name/3Name) and a
 * `variants` array. Variants carry pricing via `default_price` (major-unit
 * decimal) and per-store pricing overrides inside `stores[]`.
 *
 * The `image_url` field is a single image URL on the item level.
 *
 * Loyverse does not surface a product `status` (published/draft) in the API,
 * so `status` is omitted from the canonical shape.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Loyverse shapes ──────────────────────────────────────────────────────

export interface RawLoyverseVariantStore {
  store_id: string
  price_type?: string
  price?: number | null
  in_stock?: number | null
}

export interface RawLoyverseVariant {
  variant_id: string
  item_id?: string
  sku?: string | null
  reference_variant_id?: string | null
  option1_value?: string | null
  option2_value?: string | null
  option3_value?: string | null
  barcode?: string | null
  cost?: number | null
  purchase_cost?: number | null
  default_pricing_type?: string
  /** Selling price in major units (e.g. 9.99 for $9.99). */
  default_price?: number | null
  stores?: RawLoyverseVariantStore[]
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

export interface RawLoyverseItem {
  id: string
  handle?: string | null
  item_name: string
  description?: string | null
  reference_id?: string | null
  category_id?: string | null
  track_stock?: boolean
  sold_by_weight?: boolean
  is_composite?: boolean
  use_production?: boolean
  primary_supplier_id?: string | null
  tax_ids?: string[]
  modifier_ids?: string[]
  form?: string | null
  color?: string | null
  image_url?: string | null
  option1_name?: string | null
  option2_name?: string | null
  option3_name?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  variants?: RawLoyverseVariant[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

/** Build ProductOption entries from Loyverse's flat option1/2/3 name fields. */
function buildOptions(raw: RawLoyverseItem): ProductOption[] | undefined {
  const opts: ProductOption[] = []
  const names = [raw.option1_name, raw.option2_name, raw.option3_name]
  const variants = raw.variants ?? []

  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (!name) continue
    const key = `option${i + 1}_value` as
      | 'option1_value'
      | 'option2_value'
      | 'option3_value'
    const values = Array.from(
      new Set(
        variants
          .map((v) => v[key])
          .filter((val): val is string => typeof val === 'string' && val.length > 0),
      ),
    )
    opts.push({ name, values, position: i })
  }

  return opts.length > 0 ? opts : undefined
}

export function transformVariant(
  raw: RawLoyverseVariant,
  currency: string = 'USD',
  optionNames?: [string | null | undefined, string | null | undefined, string | null | undefined],
): ProductVariant {
  const price = toMinor(raw.default_price, currency)

  const optionValues: Record<string, string> = {}
  if (optionNames) {
    const pairs: [string | null | undefined, string | null | undefined][] = [
      [optionNames[0], raw.option1_value],
      [optionNames[1], raw.option2_value],
      [optionNames[2], raw.option3_value],
    ]
    for (const [name, val] of pairs) {
      if (name && val) optionValues[name] = val
    }
  }

  return {
    id: raw.variant_id,
    productId: raw.item_id ?? undefined,
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? undefined,
    price: { amount: price, currency },
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  } as ProductVariant
}

export function transformProduct(raw: RawLoyverseItem, currency: string = 'USD'): Product {
  const optionNames: [string | null | undefined, string | null | undefined, string | null | undefined] =
    [raw.option1_name, raw.option2_name, raw.option3_name]

  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency, optionNames))
  const options = buildOptions(raw)

  const images: Image[] = []
  if (raw.image_url) {
    images.push({ url: raw.image_url })
  }

  return {
    id: raw.id,
    title: raw.item_name,
    description: raw.description ?? undefined,
    handle: raw.handle ?? undefined,
    options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Loyverse item body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    item_name: product.title,
    description: product.description,
    handle: product.handle,
  }
  if (product.options) {
    const [o1, o2, o3] = product.options
    if (o1) body.option1_name = o1.name
    if (o2) body.option2_name = o2.name
    if (o3) body.option3_name = o3.name
  }
  if (product.variants) {
    body.variants = product.variants.map((v) => ({
      variant_id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      default_price: v.price?.amount != null ? v.price.amount / 100 : undefined,
    }))
  }
  return body
}

/** Canonical ProductVariant → Loyverse variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    variant_id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    default_price: variant.price?.amount != null ? variant.price.amount / 100 : undefined,
  }
}
