/**
 * Shoper Product → canonical Product / ProductVariant.
 *
 * Shoper models products as a flat record where stock/pricing information
 * lives in a nested `stock` object and translations live in a
 * `translations` map keyed by locale (e.g. `pl_PL`).  Shoper does not
 * have first-class variants; products with options are exposed as separate
 * child "product" records linked via a `main_product_id` field (this adapter
 * surfaces the parent product only and ignores child variants returned in
 * the product list — callers who need variants should call listVariants with
 * a productId filter).
 *
 * Relevant API path: GET /webapi/rest/products[/{id}]
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperProductTranslation {
  name?: string
  description?: string
  short_description?: string
  active?: boolean | number
  [key: string]: unknown
}

export interface RawShoperProductStock {
  price?: string | number | null
  price_old?: string | number | null
  availability_id?: number | string | null
  delivery_id?: number | string | null
  stock?: number | null
  gfx_id?: number | string | null
  weight?: string | number | null
  weight_type?: string | null
  [key: string]: unknown
}

export interface RawShoperProductImage {
  image_id?: number | string
  name?: string
  order?: number
  extension?: string
  gfx_id?: number | string
  [key: string]: unknown
}

export interface RawShoperProduct {
  product_id: number | string
  code?: string | null
  ean?: string | null
  pkwiu?: string | null
  category_id?: number | string | null
  main_product_id?: number | string | null
  producer_id?: number | string | null
  unit_id?: number | string | null
  currency_id?: number | string | null
  stock?: RawShoperProductStock
  translations?: Record<string, RawShoperProductTranslation>
  images?: Record<string, RawShoperProductImage> | RawShoperProductImage[]
  created?: string | null
  modified?: string | null
  add_date?: string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the best translation from the map. Prefer `pl_PL` (Shoper's default
 * locale) then fall back to the first entry if the preferred locale is absent.
 */
function pickTranslation(
  translations: Record<string, RawShoperProductTranslation> | undefined,
): RawShoperProductTranslation {
  if (!translations) return {}
  return (
    translations['pl_PL'] ??
    translations['en_GB'] ??
    translations['en_US'] ??
    Object.values(translations)[0] ??
    {}
  )
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(active: boolean | number | undefined): ProductStatus | undefined {
  if (active === undefined) return undefined
  return active ? 'ACTIVE' : 'DRAFT'
}

function mapWeightUnit(wt: string | null | undefined): WeightUnit | undefined {
  if (!wt) return undefined
  const lower = wt.toLowerCase()
  if (lower === 'g' || lower === 'kg' || lower === 'oz' || lower === 'lb') return lower
  return undefined
}

function mapImages(
  images: Record<string, RawShoperProductImage> | RawShoperProductImage[] | undefined,
): Image[] | undefined {
  if (!images) return undefined
  const arr = Array.isArray(images) ? images : Object.values(images)
  if (arr.length === 0) return undefined
  const mapped = arr
    .map((img, idx): Image | undefined => {
      const url = (img as Record<string, unknown>)['url'] as string | undefined
      const src = url ?? img.name
      if (!src) return undefined
      return {
        id: img.image_id != null ? String(img.image_id) : undefined,
        url: src,
        position: img.order ?? idx,
      }
    })
    .filter((i): i is Image => i != null)
  return mapped.length > 0 ? mapped : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawShoperProduct, _currency: string = 'PLN'): Product {
  const translation = pickTranslation(raw.translations)

  return {
    id: String(raw.product_id),
    title: translation.name ?? String(raw.product_id),
    description: translation.description ?? undefined,
    handle: raw.code ?? undefined,
    status: mapStatus(translation.active as boolean | number | undefined),
    vendor: undefined,
    productType: undefined,
    tags: undefined,
    options: undefined,
    variants: undefined,
    images: mapImages(raw.images),
    createdAt: raw.created ?? raw.add_date ?? undefined,
    updatedAt: raw.modified ?? raw.edit_date ?? undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Shoper product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    code: product.handle,
    translations: product.title
      ? {
          pl_PL: {
            name: product.title,
            description: product.description ?? '',
            active: product.status === 'ACTIVE' ? 1 : 0,
          },
        }
      : undefined,
  }
}

// ── Variant transform ────────────────────────────────────────────────────────

/**
 * Shoper variant records share the same structure as products
 * (child products linked via `main_product_id`).
 */
export function transformVariant(
  raw: RawShoperProduct,
  currency: string = 'PLN',
): ProductVariant {
  const translation = pickTranslation(raw.translations)
  const stock = raw.stock ?? {}

  return {
    id: String(raw.product_id),
    productId: raw.main_product_id != null ? String(raw.main_product_id) : undefined,
    sku: raw.code ?? undefined,
    barcode: raw.ean ?? undefined,
    title: translation.name ?? undefined,
    price: { amount: majorToMinor(toNum(stock.price), currency), currency },
    compareAtPrice:
      toNum(stock.price_old) > 0
        ? { amount: majorToMinor(toNum(stock.price_old), currency), currency }
        : undefined,
    weight: toNum(stock.weight) > 0 ? toNum(stock.weight) : undefined,
    weightUnit: mapWeightUnit(stock.weight_type as string | null | undefined),
    taxable: undefined,
    requiresShipping: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical ProductVariant → Shoper variant body (for update). */
export function untransformVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    code: variant.sku,
    ean: variant.barcode,
    translations: variant.title
      ? {
          pl_PL: { name: variant.title },
        }
      : undefined,
    stock: {
      price: minorToMajor(variant.price?.amount, variant.price?.currency),
      weight: variant.weight,
    },
  }
}
