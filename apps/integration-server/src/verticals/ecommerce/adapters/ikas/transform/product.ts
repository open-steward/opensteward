/**
 * ikas Product / Variant → canonical Product / ProductVariant.
 *
 * ikas models products as:
 *   Product → variants (IkasVariant) → prices (IkasVariantPrice) + stocks (IkasVariantStock)
 *
 * Key API shapes (from ikas GraphQL listProduct / saveProduct):
 *   - Product.id, name, description, isActive, tags, categories, brand
 *   - Variant.id, sku, barcodeList, prices[].sellPrice/discountPrice,
 *     stocks[].stockCount, variantValues (option selections), weight, isActive
 *
 * Docs: https://ikas.dev/docs/api/admin-api/products
 */

import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface IkasVariantPrice {
  sellPrice?: number | null
  discountPrice?: number | null
  priceListId?: string
  currency?: string
}

export interface IkasVariantStock {
  stockCount?: number | null
  stockLocationId?: string
}

export interface IkasVariantValue {
  variantTypeId?: string
  variantTypeName?: string
  variantValueId?: string
  variantValueName?: string
}

export interface RawIkasVariant {
  id: string
  sku?: string | null
  barcodeList?: string[] | null
  weight?: number | null
  isActive?: boolean | null
  prices?: IkasVariantPrice[] | null
  stocks?: IkasVariantStock[] | null
  variantValues?: IkasVariantValue[] | null
  [key: string]: unknown
}

export interface RawIkasCategory {
  id?: string
  name?: string
}

export interface RawIkasBrand {
  id?: string
  name?: string
}

export interface RawIkasProduct {
  id: string
  name: string
  description?: string | null
  isActive?: boolean | null
  tags?: string[] | null
  categories?: RawIkasCategory[] | null
  brand?: RawIkasBrand | null
  variants?: RawIkasVariant[] | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick the first price entry (default price list). ikas supports multiple
 * price lists; we use the first unless a specific one is requested.
 */
function pickPrice(prices: IkasVariantPrice[] | null | undefined): IkasVariantPrice | undefined {
  if (!prices || prices.length === 0) return undefined
  return prices[0]
}

/** Build canonical `optionValues` record from ikas variantValues array. */
function buildOptionValues(
  values: IkasVariantValue[] | null | undefined,
): Record<string, string> | undefined {
  if (!values || values.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const v of values) {
    if (v.variantTypeName && v.variantValueName) {
      out[v.variantTypeName] = v.variantValueName
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Derive the product's canonical `options` list from the variant value data.
 * ikas does not expose option definitions at the product level in the list
 * query; we reconstruct them by aggregating variant values.
 */
function deriveOptions(variants: RawIkasVariant[] | null | undefined): ProductOption[] | undefined {
  if (!variants || variants.length === 0) return undefined
  const optionMap = new Map<string, Set<string>>()
  for (const v of variants) {
    for (const vv of v.variantValues ?? []) {
      if (!vv.variantTypeName) continue
      if (!optionMap.has(vv.variantTypeName)) {
        optionMap.set(vv.variantTypeName, new Set())
      }
      if (vv.variantValueName) {
        optionMap.get(vv.variantTypeName)!.add(vv.variantValueName)
      }
    }
  }
  if (optionMap.size === 0) return undefined
  return Array.from(optionMap.entries()).map(([name, values]) => ({
    name,
    values: Array.from(values),
  }))
}

function buildVariantTitle(values: IkasVariantValue[] | null | undefined): string | undefined {
  if (!values || values.length === 0) return undefined
  const parts = values.filter((v) => v.variantValueName).map((v) => v.variantValueName!)
  return parts.length > 0 ? parts.join(' / ') : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformVariant(
  raw: RawIkasVariant,
  productId: string,
  currency = 'TRY',
): ProductVariant {
  const priceEntry = pickPrice(raw.prices)
  const sellPrice = priceEntry?.sellPrice
  const discountPrice = priceEntry?.discountPrice
  const cur = priceEntry?.currency ?? currency

  return {
    id: raw.id,
    productId,
    sku: raw.sku ?? undefined,
    barcode: raw.barcodeList?.[0] ?? undefined,
    title: buildVariantTitle(raw.variantValues),
    price: {
      amount: sellPrice != null ? majorToMinor(sellPrice, cur) : 0,
      currency: cur,
    },
    compareAtPrice:
      discountPrice != null && discountPrice > 0
        ? { amount: majorToMinor(discountPrice, cur), currency: cur }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: 'kg',
    optionValues: buildOptionValues(raw.variantValues),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawIkasProduct): Product {
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, raw.id))
  const options = deriveOptions(raw.variants)
  const status = raw.isActive === false ? ('DRAFT' as const) : ('ACTIVE' as const)

  return {
    id: raw.id,
    title: raw.name,
    description: raw.description ?? undefined,
    status,
    vendor: raw.brand?.name ?? undefined,
    productType: raw.categories?.[0]?.name ?? undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    options: options ?? undefined,
    variants: variants.length > 0 ? variants : undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Untransform (canonical → ikas input) ─────────────────────────────────────

/** Canonical Product → ikas `ProductInput` (for saveProduct mutation). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    name: product.title,
    description: product.description,
    isActive: product.status !== 'ARCHIVED' && product.status !== 'DRAFT',
    tags: product.tags,
  }
}

/** Canonical ProductVariant → ikas variant input fields. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    id: variant.id,
    sku: variant.sku,
    barcodeList: variant.barcode ? [variant.barcode] : undefined,
    weight: variant.weight,
    isActive: true,
  }
}
