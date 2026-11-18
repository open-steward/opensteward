/**
 * Squarespace Product / Variant → canonical.
 *
 * Products come from the v2 Products API: GET /v2/commerce/products (list)
 * and GET /v2/commerce/products/{productIdCsvs} (get), each a list of
 * DigitalProduct | GiftCardProduct | PhysicalProduct | ServiceProduct.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/products
 * Spec: https://developers.squarespace.com/commerce-apis/latest/schema-processor-version-version-latest.json
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
  WeightUnit,
} from '../../../schema/product'
import type { Image, Money } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Squarespace shapes ──────────────────────────────────────────────────

/**
 * MonetaryAmount: "A monetary amount with currency code and decimal value."
 * `value` is "Decimal monetary value." (example 49.99, major units) and
 * `currency` an "ISO 4217 currency code." (example "USD"). The spec types
 * `currency` as an object {currencyCode, defaultFractionDigits, ...} while
 * describing it as a code with the string example "USD", and every rendered
 * example uses the string. Only the string form is read; an object form
 * leaves the amount unmapped (and a required price throws) rather than being
 * guessed at. Unverified against a live store.
 */
export interface RawSquarespaceMonetaryAmount {
  currency?: string
  value?: number
}

/** ProductImage. */
export interface RawSquarespaceImage {
  id?: string
  url?: string
  altText?: string
  orderIndex?: number
  originalSize?: Record<string, unknown>
  availableFormats?: string[]
  [key: string]: unknown
}

/** PhysicalProductVariant / ServiceProductVariant / GiftCardProductVariant. */
export interface RawSquarespaceVariant {
  id: string
  sku?: string
  gtin?: string
  mpn?: string
  pricing?: {
    basePrice?: RawSquarespaceMonetaryAmount
    salePrice?: RawSquarespaceMonetaryAmount
    onSale?: boolean
  }
  stock?: {
    quantity?: number
    unlimited?: boolean
  }
  attributes?: Record<string, string>
  shippingMeasurements?: {
    dimensions?: Record<string, unknown>
    weight?: { value?: number; unit?: string }
  }
  image?: RawSquarespaceImage
  [key: string]: unknown
}

/** ProductV2: one of the four product types, discriminated by `type`. */
export interface RawSquarespaceProduct {
  id: string
  type?: string
  storePageId?: string
  name?: string
  description?: string
  url?: string
  urlSlug?: string
  tags?: string[]
  isVisible?: boolean
  seoOptions?: {
    title?: string
    description?: string
  }
  variants?: RawSquarespaceVariant[]
  images?: RawSquarespaceImage[]
  createdOn?: string
  modifiedOn?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A documented MonetaryAmount → canonical Money, or undefined when its value
 * or currency is absent. The value is a decimal in major units, so it is
 * scaled by the currency's own exponent.
 */
function toMoney(raw: RawSquarespaceMonetaryAmount | undefined): Money | undefined {
  const currency = raw?.currency
  const value = raw?.value
  if (typeof currency !== 'string' || currency === '') return undefined
  if (typeof value !== 'number') return undefined
  const amount = majorToMinor(value, currency)
  if (amount === undefined) return undefined
  return { amount, currency }
}

/** ProductWeightUnit: "Supported values: `KILOGRAM`, `POUND`." */
function mapWeightUnit(unit: string | undefined): WeightUnit | undefined {
  if (unit === 'KILOGRAM') return 'kg'
  if (unit === 'POUND') return 'lb'
  return undefined
}

function mapStatus(isVisible: boolean | undefined): ProductStatus | undefined {
  if (isVisible === undefined) return undefined
  return isVisible ? 'ACTIVE' : 'DRAFT'
}

/** ProductImage → canonical Image; an image without its documented `url` is dropped. */
function transformImage(raw: RawSquarespaceImage): Image | undefined {
  if (typeof raw.url !== 'string' || raw.url === '') return undefined
  return {
    id: raw.id,
    url: raw.url,
    alt: raw.altText || undefined,
    position: raw.orderIndex,
  }
}

/**
 * Product options derived from the variants' `attributes` maps (the v2
 * product has no options array, only `variantAttributes` names), in the
 * order the names first appear.
 */
function deriveOptions(variants: RawSquarespaceVariant[]): ProductOption[] | undefined {
  const optionMap = new Map<string, Set<string>>()
  for (const v of variants) {
    if (!v.attributes) continue
    for (const [name, value] of Object.entries(v.attributes)) {
      let set = optionMap.get(name)
      if (!set) {
        set = new Set()
        optionMap.set(name, set)
      }
      set.add(value)
    }
  }
  if (optionMap.size === 0) return undefined
  const options: ProductOption[] = []
  let pos = 0
  for (const [name, values] of optionMap) {
    options.push({ name, values: [...values], position: pos++ })
  }
  return options
}

/**
 * A v2 product variant → canonical ProductVariant.
 *
 * Pricing: a variant's `pricing` is FullProductPricing {basePrice, onSale,
 * salePrice}, whose `onSale` carries no description in the spec. The reading
 * here borrows the description the spec gives the same-named field on
 * ProductPricing (the product-level pricing of DIGITAL products): "Indicates
 * whether the variant is sold according to its sale price". So an on-sale
 * variant sells at `salePrice` with `basePrice` as the compare-at price;
 * otherwise it sells at `basePrice`. The selling price
 * is required, so a variant without a documented amount and currency for it
 * throws rather than inventing one.
 */
export function transformVariant(raw: RawSquarespaceVariant, productId?: string): ProductVariant {
  const base = toMoney(raw.pricing?.basePrice)
  const onSale = raw.pricing?.onSale === true
  const price = onSale ? toMoney(raw.pricing?.salePrice) : base
  if (!price) {
    throw new Error(
      `Squarespace variant ${raw.id} has no ${onSale ? 'pricing.salePrice' : 'pricing.basePrice'} with a value and currency`,
    )
  }
  const weight = raw.shippingMeasurements?.weight
  const weightUnit = mapWeightUnit(weight?.unit)
  const attributes =
    raw.attributes && Object.keys(raw.attributes).length > 0 ? raw.attributes : undefined

  return {
    id: raw.id,
    productId,
    sku: raw.sku || undefined,
    barcode: raw.gtin || undefined,
    title: attributes ? Object.values(attributes).join(' / ') || undefined : undefined,
    price,
    compareAtPrice: onSale ? base : undefined,
    weight: weightUnit && typeof weight?.value === 'number' ? weight.value : undefined,
    weightUnit,
    optionValues: attributes,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** A v2 product → canonical Product. `name` is required for the title. */
export function transformProduct(raw: RawSquarespaceProduct): Product {
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw new Error(`Squarespace product ${raw.id} has no name`)
  }
  const variants = (raw.variants ?? []).map((v) => transformVariant(v, raw.id))
  const images = (raw.images ?? []).map(transformImage).filter((i): i is Image => i !== undefined)
  const options = deriveOptions(raw.variants ?? [])

  return {
    id: raw.id,
    title: raw.name,
    description: raw.description || undefined,
    handle: raw.urlSlug || undefined,
    status: mapStatus(raw.isVisible),
    productType: raw.type || undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.createdOn,
    updatedAt: raw.modifiedOn,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Squarespace product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title !== undefined) body.name = product.title
  if (product.description !== undefined) body.description = product.description
  if (product.handle !== undefined) body.urlSlug = product.handle
  if (product.status !== undefined) {
    body.isVisible = product.status === 'ACTIVE'
  }
  if (product.tags) body.tags = product.tags
  return body
}

/** Canonical ProductVariant → Squarespace variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (variant.sku !== undefined) body.sku = variant.sku
  if (variant.price) {
    body.pricing = {
      basePrice: {
        // Canonical amount is already integer cents — emit as minor-unit string.
        value: String(Math.round(variant.price.amount)),
        currency: variant.price.currency,
      },
    }
  }
  if (variant.optionValues) body.attributes = variant.optionValues
  return body
}
