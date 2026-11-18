/**
 * Medusa v2 Product → canonical Product / ProductVariant.
 *
 * Medusa v2 products have:
 *  - `status`: 'draft' | 'proposed' | 'published' | 'rejected'
 *  - `variants[]` nested inline with `prices[]` array
 *  - `options[]` with `values[]`
 *  - `images[]` with `url` field
 *
 * Money: Medusa v2 stores prices as integer cents. Divide by 100.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw Medusa shapes ──────────────────────────────────────────────────────

export interface RawMedusaImage {
  id?: string
  url?: string
  rank?: number
  [key: string]: unknown
}

export interface RawMedusaOptionValue {
  id?: string
  value: string
  option_id?: string
  option?: { title?: string; id?: string } | null
  [key: string]: unknown
}

export interface RawMedusaOption {
  id?: string
  title: string
  values?: Array<{ value: string; id?: string }>
  product_id?: string
  [key: string]: unknown
}

export interface RawMedusaPrice {
  id?: string
  amount?: number
  currency_code?: string
  [key: string]: unknown
}

export interface RawMedusaVariant {
  id: string
  title?: string
  sku?: string
  barcode?: string
  ean?: string
  upc?: string
  weight?: number | null
  width?: number | null
  height?: number | null
  length?: number | null
  inventory_quantity?: number
  manage_inventory?: boolean
  allow_backorder?: boolean
  prices?: RawMedusaPrice[]
  options?: RawMedusaOptionValue[]
  product_id?: string
  inventory_items?: Array<{ inventory_item_id?: string }>
  [key: string]: unknown
}

export interface RawMedusaProduct {
  id: string
  title: string
  subtitle?: string | null
  description?: string | null
  handle?: string | null
  status?: string
  type?: { value?: string } | null
  collection_id?: string | null
  tags?: Array<{ id?: string; value: string }>
  options?: RawMedusaOption[]
  variants?: RawMedusaVariant[]
  images?: RawMedusaImage[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(s: string | undefined): ProductStatus | undefined {
  if (!s) return undefined
  switch (s) {
    case 'published':
      return 'ACTIVE'
    case 'draft':
      return 'DRAFT'
    case 'proposed':
    case 'rejected':
      return 'ARCHIVED'
    default:
      return undefined
  }
}

function reverseStatus(s: ProductStatus | undefined): string | undefined {
  if (!s) return undefined
  switch (s) {
    case 'ACTIVE':
      return 'published'
    case 'DRAFT':
      return 'draft'
    case 'ARCHIVED':
      return 'rejected'
    default:
      return undefined
  }
}

function transformImage(raw: RawMedusaImage): Image {
  return {
    id: raw.id,
    url: raw.url ?? '',
    position: raw.rank,
  }
}

function transformOption(raw: RawMedusaOption): ProductOption {
  return {
    id: raw.id,
    name: raw.title,
    values: (raw.values ?? []).map((v) => v.value),
  }
}

/**
 * Find the best price for a variant. Prefer the first price entry.
 * Medusa v2 prices are in integer cents — divide by 100.
 */
function findPrice(
  prices: RawMedusaPrice[] | undefined,
  currency: string,
): { amount: number; currency: string } {
  if (!prices || prices.length === 0) return { amount: 0, currency }
  const match = prices.find(
    (p) => p.currency_code?.toLowerCase() === currency.toLowerCase(),
  )
  const price = match ?? prices[0]!
  return {
    amount: Math.round(price.amount ?? 0),
    currency: price.currency_code ?? currency,
  }
}

function buildOptionValues(
  opts: RawMedusaOptionValue[] | undefined,
): Record<string, string> | undefined {
  if (!opts || opts.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const o of opts) {
    const name = o.option?.title ?? o.option_id ?? 'unknown'
    out[name] = o.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformProductVariant(
  raw: RawMedusaVariant,
  productId: string,
  currency: string = 'USD',
): ProductVariant {
  const price = findPrice(raw.prices, currency)
  const inventoryItemId =
    raw.inventory_items?.[0]?.inventory_item_id ?? undefined

  return {
    id: raw.id,
    productId: raw.product_id ?? productId,
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? raw.ean ?? raw.upc ?? undefined,
    title: raw.title ?? undefined,
    price,
    weight: raw.weight ?? undefined,
    weightUnit: raw.weight != null ? 'g' : undefined,
    inventoryItemId,
    optionValues: buildOptionValues(raw.options),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformProduct(
  raw: RawMedusaProduct,
  currency: string = 'USD',
): Product {
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.options ?? []).map(transformOption)
  const variants = (raw.variants ?? []).map((v) =>
    transformProductVariant(v, raw.id, currency),
  )
  const tags = raw.tags?.map((t) => t.value)

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? undefined,
    handle: raw.handle ?? undefined,
    status: mapStatus(raw.status),
    productType: raw.type?.value ?? undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → Medusa product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: product.title,
    description: product.description,
    handle: product.handle,
    status: reverseStatus(product.status),
  }
  if (product.options) {
    body['options'] = product.options.map((o) => ({
      title: o.name,
      values: o.values,
    }))
  }
  if (product.tags) {
    body['tags'] = product.tags.map((t) => ({ value: t }))
  }
  if (product.images) {
    body['images'] = product.images.map((i) => ({ url: i.url }))
  }
  return body
}

/** Canonical ProductVariant → Medusa variant body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: variant.title,
    sku: variant.sku,
    barcode: variant.barcode,
    weight: variant.weight,
  }
  if (variant.price) {
    body['prices'] = [
      {
        amount: Math.round(variant.price.amount),
        currency_code: variant.price.currency,
      },
    ]
  }
  if (variant.optionValues) {
    body['options'] = Object.entries(variant.optionValues).map(([_name, value]) => ({
      value,
    }))
  }
  return body
}
