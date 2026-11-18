/**
 * Ecwid Product → canonical Product / ProductVariant.
 *
 * Ecwid products can have combinations (variants). Each combination has
 * its own `id`, `sku`, `price`, and option selections. Products without
 * combinations are "simple" — we synthesize a default variant for them.
 *
 * Ecwid price fields are numeric (not strings like WooCommerce).
 * Product status is `enabled: boolean` → ACTIVE / ARCHIVED.
 * Options live under `options[]` with `choices[]`.
 *
 * Docs: https://developer.ecwid.com/
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Integer minor units → major-unit decimal number for upstream payloads. */
function minorToMajor(money: { amount: number; currency: string } | undefined):
  | number
  | undefined {
  if (money == null) return undefined
  const c = money.currency.toUpperCase()
  const exponent = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2
  return money.amount / 10 ** exponent
}

// ── Raw Ecwid shapes ────────────────────────────────────────────────────────

export interface RawEcwidImage {
  id?: string | number
  url?: string
  thumbnail?: string
  originalImageUrl?: string
  imageUrl?: string
  smallThumbnailUrl?: string
  hdThumbnailUrl?: string
  alt?: string | null
  orderBy?: number
  isMain?: boolean
  width?: number
  height?: number
}

export interface RawEcwidOptionChoice {
  text: string
  priceModifier?: number
  priceModifierType?: string
}

export interface RawEcwidOption {
  name: string
  type?: string
  choices?: RawEcwidOptionChoice[]
  required?: boolean
  defaultChoice?: number
}

export interface RawEcwidCombination {
  id: number | string
  combinationNumber?: number
  sku?: string
  price?: number | null
  defaultDisplayedPrice?: number | null
  costPrice?: number | null
  compareToPrice?: number | null
  quantity?: number | null
  unlimited?: boolean
  warningLimit?: number
  weight?: number | null
  options?: Array<{ name: string; value: string }>
  thumbnailUrl?: string
  imageUrl?: string
  hdThumbnailUrl?: string
  smallThumbnailUrl?: string
  originalImageUrl?: string
  [key: string]: unknown
}

export interface RawEcwidCategory {
  id: number | string
  enabled?: boolean
}

export interface RawEcwidProduct {
  id: number | string
  name: string
  sku?: string
  url?: string
  quantity?: number | null
  unlimited?: boolean
  price?: number | null
  defaultDisplayedPrice?: number | null
  costPrice?: number | null
  compareToPrice?: number | null
  weight?: number | null
  enabled?: boolean
  description?: string
  categoryIds?: Array<number | string>
  defaultCategoryId?: number | string
  categories?: RawEcwidCategory[]
  imageUrl?: string
  thumbnailUrl?: string
  hdThumbnailUrl?: string
  smallThumbnailUrl?: string
  originalImageUrl?: string
  galleryImages?: RawEcwidImage[]
  media?: { images?: RawEcwidImage[] }
  options?: RawEcwidOption[]
  combinations?: RawEcwidCombination[]
  tax?: { taxable?: boolean; defaultLocationIncludedTaxRate?: number }
  createTimestamp?: number
  updateTimestamp?: number
  created?: string
  updated?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(enabled: boolean | undefined): ProductStatus | undefined {
  if (enabled === undefined) return undefined
  return enabled ? 'ACTIVE' : 'ARCHIVED'
}

function transformImage(raw: RawEcwidImage, position?: number): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.imageUrl ?? raw.url ?? raw.originalImageUrl ?? '',
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.orderBy ?? position,
  }
}

function transformOption(raw: RawEcwidOption): ProductOption {
  return {
    name: raw.name,
    values: (raw.choices ?? []).map((c) => c.text),
  }
}

function buildCombinationOptionValues(
  options: Array<{ name: string; value: string }> | undefined,
): Record<string, string> | undefined {
  if (!options || options.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const o of options) {
    out[o.name] = o.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function timestampToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformProductVariant(
  raw: RawEcwidCombination,
  productId: string,
  currency: string = 'USD',
): ProductVariant {
  const price = raw.defaultDisplayedPrice ?? raw.price
  return {
    id: `${productId}:${raw.id}`,
    productId,
    sku: raw.sku || undefined,
    title: undefined,
    price: { amount: majorToMinor(price ?? 0, currency), currency },
    compareAtPrice:
      raw.compareToPrice != null && raw.compareToPrice > 0
        ? { amount: majorToMinor(raw.compareToPrice, currency), currency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: raw.weight != null ? 'g' : undefined,
    inventoryItemId: String(raw.id),
    optionValues: buildCombinationOptionValues(raw.options),
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
    },
  }
}

export function transformProduct(
  raw: RawEcwidProduct,
  currency: string = 'USD',
): Product {
  const productId = String(raw.id)

  // Build images from gallery or main product image
  const images: Image[] = []
  const galleryImgs = raw.galleryImages ?? raw.media?.images ?? []
  if (galleryImgs.length > 0) {
    galleryImgs.forEach((img, idx) => images.push(transformImage(img, idx)))
  } else if (raw.imageUrl || raw.originalImageUrl) {
    images.push({
      url: raw.imageUrl ?? raw.originalImageUrl ?? '',
      position: 0,
    })
  }

  // Options
  const options = (raw.options ?? [])
    .filter((o) => (o.choices ?? []).length > 0)
    .map(transformOption)

  // Combinations → variants
  const variants = (raw.combinations ?? []).map((c) =>
    transformProductVariant(c, productId, currency),
  )

  // For simple products, synthesize a single variant
  if (variants.length === 0) {
    const price = raw.defaultDisplayedPrice ?? raw.price
    variants.push({
      id: `${productId}:default`,
      productId,
      sku: raw.sku || undefined,
      price: { amount: majorToMinor(price ?? 0, currency), currency },
      compareAtPrice:
        raw.compareToPrice != null && raw.compareToPrice > 0
          ? { amount: majorToMinor(raw.compareToPrice, currency), currency }
          : undefined,
      weight: raw.weight ?? undefined,
      weightUnit: raw.weight != null ? 'g' : undefined,
      inventoryItemId: productId,
      metadata: {
        synthetic: true,
        reason: 'Ecwid product has no combinations',
        parentProductId: productId,
      },
    })
  }

  return {
    id: productId,
    title: raw.name,
    description: raw.description,
    handle: raw.sku,
    status: mapStatus(raw.enabled),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created ?? timestampToIso(raw.createTimestamp),
    updatedAt: raw.updated ?? timestampToIso(raw.updateTimestamp),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → Ecwid product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    sku: product.handle,
    enabled:
      product.status === 'ACTIVE'
        ? true
        : product.status === 'ARCHIVED' || product.status === 'DRAFT'
          ? false
          : undefined,
  }
  if (product.options) {
    body['options'] = product.options.map((o) => ({
      name: o.name,
      type: 'SELECT',
      choices: o.values.map((v) => ({ text: v, priceModifier: 0, priceModifierType: 'ABSOLUTE' })),
      required: true,
    }))
  }
  if (product.images) {
    body['galleryImages'] = product.images.map((i) => ({
      url: i.url,
      alt: i.alt,
      orderBy: i.position,
    }))
  }
  // Simple-product pricing
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['price'] = minorToMajor(v.price)
    if (v.compareAtPrice?.amount != null) body['compareToPrice'] = minorToMajor(v.compareAtPrice)
    if (v.sku) body['sku'] = v.sku
  }
  return body
}

/** Canonical ProductVariant → Ecwid combination body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sku: variant.sku,
    price: minorToMajor(variant.price),
    compareToPrice: minorToMajor(variant.compareAtPrice),
    weight: variant.weight,
  }
  if (variant.optionValues) {
    body['options'] = Object.entries(variant.optionValues).map(([name, value]) => ({
      name,
      value,
    }))
  }
  return body
}
