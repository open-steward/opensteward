/**
 * Nacelle Storefront GraphQL Product / Variant → canonical.
 *
 * Field names follow the documented canonical data model:
 *   https://docs.nacelle.com/docs/product-data-model
 *   https://docs.nacelle.com/docs/variant-data-model
 *
 * Nacelle's "Entry" model separates identity/inventory fields (on the entry
 * itself) from localized `content` (title, description, handle, media,
 * options — one entry per locale). We take the first content entry (or the
 * one matching `locale` when given) as the presentation fields; unlocalized
 * platforms will simply have one.
 *
 * `createdAt`/`updatedAt`/`indexedAt` are Unix timestamps in SECONDS (not ISO
 * strings, unlike most other adapters in this vertical).
 *
 * Variant `price`/`compareAtPrice` are documented as a plain `Decimal` major-
 * unit number + separate `priceCurrency` — NOT the `{amount, currencyCode,
 * precisionDigits}` integer-minor-unit shape NOMS's Money type uses
 * elsewhere in Nacelle's API. `majorToMinor` converts to canonical integer
 * minor units.
 */

import type { Product, ProductVariant, ProductOption, WeightUnit } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Nacelle shapes (minimal, per docs) ───────────────────────────────────

export interface RawNacelleMedia {
  id?: string
  src?: string
  url?: string
  alt?: string | null
  width?: number
  height?: number
  position?: number
}

export interface RawNacelleProductOption {
  name: string
  values: string[]
}

export interface RawNacelleProductContent {
  title?: string
  description?: string
  handle?: string
  locale?: string
  media?: RawNacelleMedia[]
  featuredMedia?: RawNacelleMedia
  options?: RawNacelleProductOption[]
  published?: boolean
}

export interface RawNacelleVariantContent {
  title?: string
  locale?: string
}

export interface RawNacelleVariant {
  nacelleEntryId: string
  sourceEntryId?: string
  sourceId?: string
  productEntryId?: string
  productHandle?: string
  sku?: string
  price?: number | string
  priceCurrency?: string
  compareAtPrice?: number | string | null
  weight?: number
  weightUnit?: string
  quantityAvailable?: number
  availableForSale?: boolean
  variantPosition?: number
  content?: RawNacelleVariantContent[]
}

export interface RawNacelleProduct {
  nacelleEntryId: string
  sourceEntryId?: string
  sourceId?: string
  availableForSale?: boolean
  vendor?: string
  productType?: string
  tags?: string[]
  createdAt?: number
  updatedAt?: number
  indexedAt?: number
  variants?: RawNacelleVariant[]
  content?: RawNacelleProductContent[]
}

const WEIGHT_UNITS: ReadonlySet<string> = new Set(['g', 'kg', 'oz', 'lb'])

function toWeightUnit(unit: string | undefined): WeightUnit | undefined {
  if (unit == null) return undefined
  const lower = unit.toLowerCase()
  return WEIGHT_UNITS.has(lower) ? (lower as WeightUnit) : undefined
}

/** Unix-seconds timestamp → ISO 8601, per Nacelle's documented timestamp convention. */
function toIso(unixSeconds: number | undefined): string | undefined {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return undefined
  return new Date(unixSeconds * 1000).toISOString()
}

/** The content entry to present: exact `locale` match, else the first entry. */
function pickContent<T extends { locale?: string }>(
  content: T[] | undefined,
  locale?: string,
): T | undefined {
  if (!content || content.length === 0) return undefined
  if (locale) {
    const match = content.find((c) => c.locale === locale)
    if (match) return match
  }
  return content[0]
}

function toImage(media: RawNacelleMedia, position?: number): Image | undefined {
  const url = media.url ?? media.src
  if (!url) return undefined
  return {
    id: media.id,
    url,
    alt: media.alt ?? undefined,
    width: media.width,
    height: media.height,
    position: media.position ?? position,
  }
}

export function transformVariant(
  raw: RawNacelleVariant,
  locale?: string,
): ProductVariant {
  const content = pickContent(raw.content, locale)
  const currency = raw.priceCurrency
  // Canonical `price` is required (not optional) on ProductVariantSchema, but
  // Nacelle's documented `price`/`priceCurrency` are themselves per-variant
  // data, not something this adapter has a safe fallback for — a variant
  // missing either is a genuine upstream data problem, surfaced loudly
  // rather than papered over with a fabricated $0 or a guessed currency.
  if (raw.price == null || currency == null) {
    throw new Error(
      `Nacelle variant ${raw.nacelleEntryId} is missing price or priceCurrency — cannot map to canonical Money without inventing a value`,
    )
  }
  const amount = majorToMinor(Number(raw.price), currency)
  return {
    id: raw.nacelleEntryId,
    productId: raw.productEntryId,
    sku: raw.sku,
    title: content?.title,
    price: { amount, currency },
    compareAtPrice:
      raw.compareAtPrice != null
        ? { amount: majorToMinor(Number(raw.compareAtPrice), currency), currency }
        : undefined,
    weight: raw.weight,
    weightUnit: toWeightUnit(raw.weightUnit),
    position: raw.variantPosition,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Title is required canonically; Nacelle content without one is not given an invented empty title. */
function requireTitle(title: string | undefined, kind: string, id: string): string {
  if (!title) throw new Error(`Nacelle ${kind} ${id} has no content title to map; refusing to invent one`)
  return title
}

export function transformProduct(raw: RawNacelleProduct, locale?: string): Product {
  const content = pickContent(raw.content, locale)
  const images: Image[] = []
  if (content?.media) {
    for (const [i, m] of content.media.entries()) {
      const img = toImage(m, i)
      if (img) images.push(img)
    }
  }
  const options: ProductOption[] | undefined = content?.options?.map((o) => ({
    name: o.name,
    values: o.values,
  }))

  return {
    id: raw.nacelleEntryId,
    title: requireTitle(content?.title, 'product', raw.nacelleEntryId),
    description: content?.description,
    handle: content?.handle,
    status: raw.availableForSale === false ? 'DRAFT' : 'ACTIVE',
    vendor: raw.vendor,
    productType: raw.productType,
    tags: raw.tags,
    options,
    variants: raw.variants?.map((v) => transformVariant(v, locale)),
    images: images.length > 0 ? images : undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    publishedAt: content?.published ? toIso(raw.updatedAt) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
