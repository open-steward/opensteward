/**
 * Starweb Product / Variant → canonical.
 *
 * Starweb models products with a `primaryVariant` (or full `variants`
 * collection when `include=variants` is requested). Pricing lives on
 * variant price-list entries (`prices` array). The API returns money as
 * decimal major units (e.g. "199.00") in the store's currency; we convert
 * to integer minor units with `majorToMinor`.
 *
 * Product statuses come as `visibility` strings: `"visible"` → ACTIVE,
 * `"hidden"` → DRAFT. Variants carry `isActive` bool.
 *
 * Docs: https://api-docs.starweb.se/
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Starweb shapes ────────────────────────────────────────────────────────

export interface RawStarwebVariantPrice {
  pricelistId?: number
  price?: number | null
  priceExcludingVat?: number | null
  currency?: string
  [key: string]: unknown
}

export interface RawStarwebVariantAttributeValue {
  attributeId?: number
  attributeValueId?: number
  attributeName?: string
  attributeValue?: string
  [key: string]: unknown
}

export interface RawStarwebVariant {
  variantId: number | string
  sku?: string | null
  ean?: string | null
  mpn?: string | null
  isActive?: boolean
  sortIndex?: number | null
  stockQuantity?: number | null
  stockStatusId?: number | null
  weightInKg?: number | null
  costPrice?: number | null
  externalId?: string | null
  imageFileId?: number | null
  prices?: RawStarwebVariantPrice[]
  attributeValues?: RawStarwebVariantAttributeValue[]
  [key: string]: unknown
}

export interface RawStarwebProductLanguage {
  langCode?: string
  name?: string
  shortDescription?: string
  longDescription?: string
  url?: string
  [key: string]: unknown
}

export interface RawStarwebMediaFile {
  fileId?: number | string
  fileName?: string
  fileUrl?: string
  sortIndex?: number
  [key: string]: unknown
}

export interface RawStarwebProductCategory {
  categoryId?: number | string
  [key: string]: unknown
}

/** Starweb wraps all included sub-collections in `{data:[...]}` envelopes. */
export interface StarwebDataEnvelope<T> {
  data?: T[]
}

/** Starweb wraps a single included sub-resource in `{data: item}` envelope. */
export interface StarwebDataItemEnvelope<T> {
  data?: T
}

export interface RawStarwebProduct {
  productId: number | string
  createdAt?: string | null
  modifiedAt?: string | null
  visibility?: string // 'visible' | 'hidden'
  type?: string // 'basic' | 'bundle'
  sortIndex?: number | null
  hasSeceralVariants?: boolean
  defaultVatRate?: string | null
  externalId?: string | null
  manufacturerId?: number | null
  unitId?: number | null
  /** Nested include — wrapped in `{data:[...]}` by the API. */
  languages?: StarwebDataEnvelope<RawStarwebProductLanguage>
  /** Nested include — wrapped in `{data:[...]}` by the API. */
  variants?: StarwebDataEnvelope<RawStarwebVariant>
  /** Single primary variant — wrapped in `{data: item}` by the API. */
  primaryVariant?: StarwebDataItemEnvelope<RawStarwebVariant>
  /** Nested include — wrapped in `{data:[...]}` by the API. */
  mediaFiles?: StarwebDataEnvelope<RawStarwebMediaFile>
  /** Nested include — wrapped in `{data:[...]}` by the API. */
  categories?: StarwebDataEnvelope<RawStarwebProductCategory>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the price from the first price-list entry. Starweb stores prices as
 * decimal major units.
 */
function pickPrice(
  prices: RawStarwebVariantPrice[] | undefined,
  currency: string,
): { amount: number; currency: string } {
  const first = prices?.[0]
  const raw = first?.price ?? 0
  const cur = first?.currency ?? currency
  return { amount: majorToMinor(raw, cur), currency: cur }
}

function mapStatus(visibility: string | undefined): ProductStatus | undefined {
  if (!visibility) return undefined
  switch (visibility.toLowerCase()) {
    case 'visible':
      return 'ACTIVE'
    case 'hidden':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapImage(raw: RawStarwebMediaFile, index: number): Image | undefined {
  if (!raw.fileUrl) return undefined
  return {
    id: raw.fileId != null ? String(raw.fileId) : undefined,
    url: raw.fileUrl,
    position: raw.sortIndex ?? index,
  }
}

/**
 * Build the canonical `optionValues` record from variant attribute values.
 * Each attribute value carries `attributeName` + `attributeValue`.
 */
function buildOptionValues(
  attributes: RawStarwebVariantAttributeValue[] | undefined,
): Record<string, string> | undefined {
  if (!attributes || attributes.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attributes) {
    if (a.attributeName && a.attributeValue) {
      out[a.attributeName] = a.attributeValue
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Build a synthetic ProductOption list from all variant attribute values
 * across the full variant list so the product has a proper `options` array.
 */
function buildOptions(variants: RawStarwebVariant[]): ProductOption[] | undefined {
  const nameToValues = new Map<string, Set<string>>()
  for (const v of variants) {
    for (const a of v.attributeValues ?? []) {
      if (!a.attributeName || !a.attributeValue) continue
      if (!nameToValues.has(a.attributeName)) {
        nameToValues.set(a.attributeName, new Set())
      }
      nameToValues.get(a.attributeName)!.add(a.attributeValue)
    }
  }
  if (nameToValues.size === 0) return undefined
  return Array.from(nameToValues.entries()).map(([name, valSet], i) => ({
    name,
    values: Array.from(valSet),
    position: i,
  }))
}

export function transformVariant(
  raw: RawStarwebVariant,
  productId: string,
  currency: string = 'USD',
): ProductVariant {
  const price = pickPrice(raw.prices, currency)
  return {
    id: String(raw.variantId),
    productId,
    sku: raw.sku ?? undefined,
    barcode: raw.ean ?? undefined,
    weight: raw.weightInKg != null ? raw.weightInKg * 1000 : undefined, // kg → g
    weightUnit: raw.weightInKg != null ? 'g' : undefined,
    price,
    inventoryItemId: String(raw.variantId),
    optionValues: buildOptionValues(raw.attributeValues),
    position: raw.sortIndex ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawStarwebProduct, currency: string = 'USD'): Product {
  const productId = String(raw.productId)

  // Nested includes are wrapped in `{data:[...]}` envelopes by the Starweb API.
  const languageList = raw.languages?.data ?? []
  const variantList = raw.variants?.data ?? (raw.primaryVariant?.data ? [raw.primaryVariant.data] : [])
  const mediaFileList = raw.mediaFiles?.data ?? []

  // Use the first language entry for localised text (usually the store default).
  const lang = languageList[0]
  const title = lang?.name ?? String(raw.productId)
  // ProductLanguageModel has longDescription and shortDescription (no plain 'description').
  const description = lang?.longDescription ?? lang?.shortDescription ?? undefined

  const variants = variantList.map((v) => transformVariant(v, productId, currency))

  const images = mediaFileList
    .map((f, i) => mapImage(f, i))
    .filter((img): img is Image => img != null)

  const options = buildOptions(variantList)

  return {
    id: productId,
    title,
    description,
    status: mapStatus(raw.visibility),
    options: options ?? undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.modifiedAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Starweb product body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    visibility:
      product.status === 'ACTIVE'
        ? 'visible'
        : product.status === 'ARCHIVED'
          ? 'hidden'
          : product.status === 'DRAFT'
            ? 'hidden'
            : undefined,
  }
  // Starweb stores localised text under `languages`.
  // ProductLanguageModel uses `longDescription` (not `description`).
  if (product.title || product.description) {
    body['languages'] = [
      {
        name: product.title,
        longDescription: product.description,
      },
    ]
  }
  return body
}

/** Canonical ProductVariant → Starweb variant body. */
export function untransformVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    sku: variant.sku,
    ean: variant.barcode,
    // Canonical weight is in grams; Starweb stores kg.
    weightInKg:
      variant.weight != null && variant.weightUnit === 'g'
        ? variant.weight / 1000
        : variant.weightUnit === 'kg'
          ? variant.weight
          : undefined,
    isActive: true,
  }
}
