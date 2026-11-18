/**
 * Sylius Product / ProductVariant -> canonical Product + ProductVariant.
 *
 * Sylius products have:
 *  - `code` (unique string slug, used as identifier), `name`, `description`
 *  - `slug` (URL slug), `status` (absent — availability via `channels`)
 *  - `variants` array with `code`, `translations`, `channelPricings`
 *  - Prices are in **cents** (integer) via `channelPricings`
 *  - Options via `options` array of option codes + `optionValues` on variants
 *  - Images on product via `images[]`
 *  - Taxons (categories) via `productTaxons[]`
 *
 * Admin API endpoint: `/api/v2/admin/products`
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw Sylius shapes ──────────────────────────────────────────────────────

export interface RawSyliusChannelPricing {
  channelCode?: string
  price?: number // cents
  originalPrice?: number | null // cents
  minimumPrice?: number | null
  [key: string]: unknown
}

export interface RawSyliusOptionValue {
  code?: string
  value?: string
  optionCode?: string
  translations?: Record<string, { value?: string }>
  [key: string]: unknown
}

export interface RawSyliusProductOption {
  code?: string
  name?: string
  position?: number
  values?: Array<{ code?: string; value?: string; translations?: Record<string, { value?: string }> }>
  translations?: Record<string, { name?: string }>
  [key: string]: unknown
}

export interface RawSyliusImage {
  id?: number | string
  type?: string
  path?: string
  [key: string]: unknown
}

export interface RawSyliusVariant {
  id?: number | string
  code: string
  name?: string | null
  position?: number
  tracked?: boolean
  onHand?: number
  onHold?: number
  shippingRequired?: boolean
  weight?: number | null
  height?: number | null
  width?: number | null
  depth?: number | null
  channelPricings?: Record<string, RawSyliusChannelPricing> | RawSyliusChannelPricing[]
  optionValues?: RawSyliusOptionValue[]
  translations?: Record<string, { name?: string }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface RawSyliusProduct {
  id?: number | string
  code: string
  name?: string
  slug?: string
  description?: string | null
  shortDescription?: string | null
  status?: string
  enabled?: boolean
  variants?: RawSyliusVariant[]
  options?: RawSyliusProductOption[]
  images?: RawSyliusImage[]
  channels?: Array<{ code?: string; name?: string }>
  mainTaxon?: { code?: string; name?: string } | null
  productTaxons?: Array<{ taxon?: { code?: string; name?: string } }>
  translations?: Record<string, { name?: string; slug?: string; description?: string }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function centsToDecimal(cents: number | null | undefined): number {
  // Sylius reports money in integer minor units (cents) — already canonical.
  if (cents == null) return 0
  return Math.round(cents)
}

function decimalToCents(amount: number | null | undefined): number {
  // Canonical amount is already integer cents — pass through for Sylius.
  if (amount == null) return 0
  return Math.round(amount)
}

function mapStatus(raw: RawSyliusProduct): ProductStatus | undefined {
  if (raw.enabled === true) return 'ACTIVE'
  if (raw.enabled === false) return 'DRAFT'
  return undefined
}

function reverseStatus(status: ProductStatus | undefined): boolean | undefined {
  switch (status) {
    case 'ACTIVE':
      return true
    case 'DRAFT':
    case 'ARCHIVED':
      return false
    default:
      return undefined
  }
}

function mapImages(images: RawSyliusImage[] | undefined): Image[] {
  if (!images || images.length === 0) return []
  return images.map((img, idx) => ({
    id: img.id != null ? String(img.id) : undefined,
    url: img.path ?? '',
    alt: img.type ?? undefined,
    position: idx,
  }))
}

function getFirstPricing(
  pricings: Record<string, RawSyliusChannelPricing> | RawSyliusChannelPricing[] | undefined,
): RawSyliusChannelPricing | undefined {
  if (!pricings) return undefined
  if (Array.isArray(pricings)) return pricings[0]
  const values = Object.values(pricings)
  return values[0]
}

function buildOptions(
  options: RawSyliusProductOption[] | undefined,
): ProductOption[] | undefined {
  if (!options || options.length === 0) return undefined
  return options.map((opt, idx) => ({
    id: opt.code,
    name: opt.name ?? opt.translations?.['en']?.name ?? opt.code ?? `option_${idx}`,
    values: (opt.values ?? []).map(
      (v) => v.value ?? v.translations?.['en']?.value ?? v.code ?? '',
    ),
    position: opt.position ?? idx,
  }))
}

function buildVariantOptionValues(
  optionValues: RawSyliusOptionValue[] | undefined,
): Record<string, string> | undefined {
  if (!optionValues || optionValues.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const ov of optionValues) {
    const key = ov.optionCode ?? ov.code ?? 'option'
    out[key] = ov.value ?? ov.translations?.['en']?.value ?? ov.code ?? ''
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// ── Variant transform ───────────────────────────────────────────────────────

export function transformProductVariant(
  raw: RawSyliusVariant,
  productId?: string,
  currency: string = 'USD',
): ProductVariant {
  const pricing = getFirstPricing(raw.channelPricings)
  const variantCurrency = currency
  const price = pricing?.price != null ? centsToDecimal(pricing.price) : 0
  const originalPrice =
    pricing?.originalPrice != null && pricing.originalPrice > 0
      ? centsToDecimal(pricing.originalPrice)
      : undefined

  return {
    id: raw.code,
    productId,
    sku: raw.code,
    title: raw.name ?? raw.translations?.['en']?.name ?? raw.code,
    price: { amount: price, currency: variantCurrency },
    compareAtPrice:
      originalPrice != null && originalPrice > price
        ? { amount: originalPrice, currency: variantCurrency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: raw.weight != null ? 'g' : undefined,
    optionValues: buildVariantOptionValues(raw.optionValues),
    taxable: true,
    requiresShipping: raw.shippingRequired ?? true,
    position: raw.position,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Product transform ────────────────────────────────────────────────────────

export function transformProduct(raw: RawSyliusProduct): Product {
  const productId = raw.code
  const images = mapImages(raw.images)
  const options = buildOptions(raw.options)

  // Determine currency from first variant pricing channel
  const currency = 'USD' // Sylius doesn't embed currency in product response; default

  const mappedVariants: ProductVariant[] =
    raw.variants && raw.variants.length > 0
      ? raw.variants.map((v) => transformProductVariant(v, productId, currency))
      : []

  return {
    id: productId,
    title: raw.name ?? raw.translations?.['en']?.name ?? raw.code,
    description: raw.description ?? raw.translations?.['en']?.description ?? undefined,
    handle: raw.slug ?? raw.translations?.['en']?.slug ?? undefined,
    status: mapStatus(raw),
    options,
    variants: mappedVariants.length > 0 ? mappedVariants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    code: product.id ?? product.handle,
    enabled: reverseStatus(product.status),
    translations: {
      en: {
        name: product.title,
        slug: product.handle,
        description: product.description,
      },
    },
  }
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    code: variant.sku ?? variant.id,
    translations: {
      en: { name: variant.title },
    },
  }
  if (variant.weight != null) {
    result['weight'] = variant.weight
  }
  if (variant.price) {
    result['channelPricings'] = {
      default: {
        price: decimalToCents(variant.price.amount),
        originalPrice: variant.compareAtPrice
          ? decimalToCents(variant.compareAtPrice.amount)
          : undefined,
      },
    }
  }
  return result
}
